"use server"

import { z } from "zod"
import { parseExaUserString, XProfile } from "@/lib/parse-exa-profile"
import { logger } from "@/lib/logger"

const ExaResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      publishedDate: z.string().optional(),
      author: z.string(),
      text: z.string(),
    }),
  ),
  requestId: z.string(),
  costDollars: z.object({
    total: z.number(),
    contents: z.object({
      text: z.number(),
    }),
  }),
})

export async function fetchTwitterProfile(username: string): Promise<XProfile | null> {
  if (!username) return null
  const cleanUsername = username.trim().replace(/^@/, "")

  try {
    logger.info(`Fetching tweets for @${cleanUsername} from EXA API`)

    const response = await fetch("https://api.exa.ai/contents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EXA_API_KEY || ""}`,
      },
      body: JSON.stringify({
        ids: [`https://x.com/${cleanUsername}`],
        text: {
          "includeHtmlTags": true
        },
        livecrawl: "always",
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`EXA API error: ${response.status} ${errorText}`)
    }

    const rawData = await response.json()

    const data = rawData.data ? rawData.data : rawData
    const validatedData = ExaResponseSchema.parse(data)
    if (validatedData.results.length === 0) {
      return null
    }
    const parsedData = parseExaUserString(validatedData.results[0].text)
    if (!parsedData.success || !parsedData.data) {
      logger.error("Error parsing tweets:")
      console.error(parsedData.error)
      return null
    }

    const tweets = parsedData.data.tweets

    logger.info(`Found ${tweets.length} tweets for @${cleanUsername}`)
    // logger.debug(tweets.slice(0, 20).map((tweet) =>
    //   `${tweet.text}

    // ❤️ ${tweet.favorite_count}, 💬 ${tweet.reply_count}, 🔄 ${tweet.retweet_count}, 🔗 ${tweet.quote_count}
    // --------------------------------`
    // ).join("\n"))

    return parsedData.data
  } catch (error) {
    logger.error(`Error fetching tweets for @${cleanUsername} from Exa:`)
    console.error(error)
    return null
  }
}

