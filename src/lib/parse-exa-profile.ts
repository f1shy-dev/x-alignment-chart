import { logger } from "./logger";

export interface ExaApiResponse {
  data: {
    results: ExaResult[];
    requestId: string;
    costDollars: {
      total: number;
      contents: {
        text: number;
      };
    };
  };
}

export interface ExaResult {
  id: string;
  title: string;
  url: string;
  publishedDate: string;
  author: string;
  text: string;
}


export type Tweet = {
  text: string,
  created_at: string,
  favorite_count: number,
  quote_count: number,
  reply_count: number,
  retweet_count: number,
  is_quote_status?: boolean,

}

export type XProfile = {
  tweets: Tweet[],
  bio?: string,
  profile_url?: string,
  name?: string,
  created_at?: string,
  followers_count?: number,
  statuses_count?: number,
  location?: string,
}

export const parseExaUserString = (raw_string: string) => {
  try {
    let composed_object: XProfile = {
      tweets: [],
    }
    const base_yml = raw_string;
    const profile_yml = base_yml.match(/^.*?<\/div>(?=.*?<div>)/s)?.[0];
    const tweets_yml = base_yml.replace(profile_yml!, '').replace('| location:', '').trim();

    const PROFILE_PATTERNS = {
      bio: /^([\s\S]*?)(?=\| (?:profile_url:|name:|created_at:|followers_count:|favourites_count:|friends_count:|media_count:|statuses_count:|location:))/,
      profile_url: /\| profile_url:\s*([^\s|]+)/,
      name: /\| name:\s*([^|]+)/,
      created_at: /\| created_at:\s*([^|]+)/,
      followers_count: /\| followers_count:\s*([^|]+)/,
      statuses_count: /\| statuses_count:\s*([^|]+)/,
      location: /\| location:\s*([^|]+)/,
    } as const;

    const remove_div = (str: string) => str.replace(/<div>/g, '').replace(/<\/div>/g, '').trim();
    const num_keys = ['followers_count', 'favourites_count', 'friends_count', 'media_count', 'statuses_count', 'favorite_count', 'quote_count', 'reply_count', 'retweet_count'];
    for (const [key, pattern] of Object.entries(PROFILE_PATTERNS)) {
      const match = profile_yml?.match(pattern);
      if (match) {
        Object.assign(composed_object, { [key]: num_keys.includes(key) ? parseInt(remove_div(match[1].trim())) : remove_div(match[1].trim()) });
      }
    }

    const each_tweet_yml = tweets_yml.split(/\| lang: [a-z]{2,3}(?:\s|$)/);

    const TWEET_PATTERNS = {
      created_at: /\| created_at:\s*([^|]+)/,
      favorite_count: /\| favorite_count:\s*([^|]+)/,
      quote_count: /\| quote_count:\s*([^|]+)/,
      reply_count: /\| reply_count:\s*([^|]+)/,
      retweet_count: /\| retweet_count:\s*([^|]+)/,
      is_quote_status: /\| is_quote_status:\s*([^|]+)/,
    } as const;


    for (const tweet of each_tweet_yml) {
      const tweet_object = {};
      for (const [key, pattern] of Object.entries(TWEET_PATTERNS)) {
        const match = tweet.match(pattern);
        if (match) {
          if (key === "is_quote_status") {
            Object.assign(tweet_object, { [key]: match[1].trim() === "True" });
          } else {
            Object.assign(tweet_object, { [key]: num_keys.includes(key) ? parseInt(remove_div(match[1].trim())) : remove_div(match[1].trim()) });
          }
        }
      }

      const tweet_text = tweet.replace(TWEET_PATTERNS.created_at, '').replace(TWEET_PATTERNS.favorite_count, '').replace(TWEET_PATTERNS.quote_count, '').replace(TWEET_PATTERNS.reply_count, '').replace(TWEET_PATTERNS.retweet_count, '').replace(TWEET_PATTERNS.is_quote_status, '').trim();
      Object.assign(tweet_object, { text: remove_div(tweet_text) });

      composed_object.tweets.push(tweet_object as Tweet);
    }

    composed_object.tweets = composed_object.tweets.filter((tweet) => tweet.text.length > 0);

    return { success: true, data: composed_object };
  } catch (error) {
    logger.error("Error parsing tweets:")
    console.error(error)
    return { success: false, error: error };
  }
}