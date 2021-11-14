import bolt from "@slack/bolt";

import { LounasResponse } from "./model/LounasDataProvider.js";
import { RestaurantNameMap, Settings } from "./model/Settings.js";

const parseLounasBlock = (lounasResponse: LounasResponse, settings: Settings): bolt.Block | bolt.KnownBlock => {
	const lounasBlock: (bolt.Block | bolt.KnownBlock) = {
		type: "section",
		text: {
			type: "mrkdwn",
			text: `*${RestaurantNameMap[lounasResponse.restaurant]}*\n${((lounasResponse.items || [lounasResponse.error]).map(item => `  ${getEmojiForLounasItem(item?.toString(), settings)} ${item}`).join("\n"))}`
		},
	};

	if (lounasResponse.items) {
		lounasBlock.accessory = {
			type: "button",
			text: {
				type: "plain_text",
				text: ":thumbsup:",
				emoji: true
			},
			value: `upvote-${lounasResponse.restaurant}`,
			action_id: "upvoteButtonAction"
		};
	}

	return lounasBlock;
};

export { parseLounasBlock };

function getEmojiForLounasItem(lounasItem = "", settings: Settings): string {
	if (settings.emojiRules) {
		for (const [key, value] of settings.emojiRules) {
			if (key.test(lounasItem)) {
				return value;
			}
		}
	}

	return ":grey_question:";
}