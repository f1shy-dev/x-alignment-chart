"use server"
import "server-only"
import { dedent } from "ts-dedent"
import { openai } from "@ai-sdk/openai"
import { CoreMessage, generateObject } from "ai"
import { z } from "zod"
import { getCachedData, setCachedData } from "../../lib/redis"
import { fetchTwitterProfile } from "../../lib/fetch-twitter-profile"
import { logger } from "@/lib/logger"
import { track } from '@vercel/analytics/server';
import { waitUntil } from "@vercel/functions";
const AlignmentSchema = z.object({
  explanation: z.string().describe("Your brief-ish explanation/reasoning for the given alignment assessment"),
  lawfulChaotic: z.number().min(-100).max(100).describe("A score from -100 (lawful) to 100 (chaotic)"),
  goodEvil: z.number().min(-100).max(100).describe("A score from -100 (good) to 100 (evil)"),
});

export type AlignmentAnalysis = z.infer<typeof AlignmentSchema>

export async function analyseUser(username: string): Promise<AlignmentAnalysis & { cached: boolean; isError: boolean }> {
  const cleanUsername = username.trim().replace(/^@/, "")
  const cacheKey = `analysis-v2:${cleanUsername}`

  try {
    const cachedAnalysis = await getCachedData<AlignmentAnalysis>(cacheKey)

    if (cachedAnalysis) {
      logger.info(`Using cached analysis for @${cleanUsername}`)
      logger.info(cachedAnalysis)

      waitUntil(track("analysis_cached", {
        username: cleanUsername,
        lawful_chaotic: cachedAnalysis.lawfulChaotic,
        good_evil: cachedAnalysis.goodEvil,
      }))
      return { ...cachedAnalysis, cached: true, isError: false }
    }

    logger.info(`Analyzing tweets for @${cleanUsername}`)

    const profile = await fetchTwitterProfile(username)
    if (!profile) {
      throw new Error(`No profile found for @${cleanUsername}`)
    }

    const profile_str = JSON.stringify({ ...profile, tweets: undefined }, null, 2)

    const tweetTexts = profile.tweets.map((tweet) => {
      const base = `<post${tweet.is_quote_status ? " is_quote=\"true\"" : ""}>
${tweet.text}`;

      const stats = [
        `${tweet.favorite_count ?? "?"} likes`,
        `${tweet.reply_count ?? "?"} replies`,
        `${tweet.retweet_count ?? "?"} retweets`,
        `${tweet.quote_count ?? "?"} quotes`,
      ].filter(x => !x.startsWith("?")).join(", ")

      return `${base}\n\n${stats}\n</post>`

    }
    ).join("\n\n")

    const messages = [
      {
        role: "system",
        content: dedent`
        Analyze the following tweets the given from Twitter user and determine their alignment on a D&D-style alignment chart.
        
        For lawful-chaotic axis:
        - Lawful (-100): Follows rules, traditions, and social norms. They value tradition, loyalty, and order.
        - Neutral (0): Balanced approach to rules and freedom
        - Chaotic (100): Rebels against convention, valuing personal freedom - follows their own moral compass regardless of rules or traditions
        
        For good-evil axis:
        - Good (-100): Altruistic, compassionate, puts others first
        - Neutral (0): Balanced self-interest and concern for others
        - Evil (100): Selfish, manipulative, or harmful to others. Some are motivated by greed, hatred, or lust for power.
        
        Based only on these tweets, provide a numerical assessment of this user's alignment. Be willing to move to any side/extreme!

        Since this is a bit of fun, be willing to overly exaggerate if the user has a specific trait expressed barely - e.g. if they are evil at some point then make sure to express it! - I don't just want everyone to end up as chaotic-neutral in the end... However don't always exaggerate a user's chaotic characteristic, you can also try to exaggerate their lawful or good/evil traits if they are more pronounced. Just be fun with it.
        
        For the explaination, try to avoid overly waffling - but show your reasoning behind your judgement. You can mention specific things about their user like mentioned traits/remarks or projects/etc - the more personalised the better.
      `.trim()
      },
      {
        role: "user",
        content:
          dedent`Username: @${username}

<user_profile>
${profile_str}
</user_profile>

<user_tweets filter="top_100">
${tweetTexts}
</user_tweets>`.trim()
      }
    ] satisfies CoreMessage[]



    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      temperature: 0.8,
      schema: AlignmentSchema,
      messages
    })

    // Cache for 2 weeks - maybe the users will have more tweets by then...
    await setCachedData(cacheKey, object, 604_800)

    waitUntil(track("analysis_complete", {
      username: cleanUsername,
      lawful_chaotic: object.lawfulChaotic,
      good_evil: object.goodEvil,
    }))

    return { ...object, cached: false, isError: false }
  } catch (error) {
    logger.error(`Error analyzing tweets for @${cleanUsername}:`)
    console.error(error)
    return {
      lawfulChaotic: 0,
      goodEvil: 0,
      explanation: `Error analyzing tweets for @${cleanUsername}... Check you used a valid username and try again later.`,
      cached: false,
      isError: true,
    }
  }
}

