import { parseExaUserString } from "./parse-exa-profile";
import test_data from "./test_data/results-hexagons_art.json"

let tweet_parsed = parseExaUserString(test_data.data.results[0].text)

const tweets = tweet_parsed.data?.tweets ?? []

// for (const tweet of tweets) {
//     console.log(tweet)
// }
tweet_parsed.data!.tweets = tweets.slice(0, 10)
console.log(tweet_parsed.data)