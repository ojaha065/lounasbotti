import type bolt from "@slack/bolt";
import { Md } from "slack-block-builder";
import type { Settings } from "./model/Settings.js";
import * as SettingsRepository from "./model/SettingsRepository.js";
import * as LounasRepository from "./model/LounasRepository.js";
import * as Utils from "./Utils.js";
import { lounasCache } from "./server.js";
import { truncateMessage } from "./BotEvents.js";

const ANNOUNCE_REGEXP = /announce "((?:\w|\d){1,30})"\s"(.{1,2000})"/;
const REMARK_REGEXP = /remark\s+(add|remove)\s+(.{1,1024})<>(.{1,2048})/;
const ADMIN_COMMANDS = ["truncateall", "announce", "remark"];

export default function(app: bolt.App, settings: Settings) {
	app.command("/whoami", async args => {
		args.ack();
		args.respond({
			response_type: "ephemeral",
			text: args.body.user_id
		});
	});

	app.command("/channel", async args => {
		args.ack();
		args.respond({
			response_type: "ephemeral",
			text: args.body.channel_id
		});
	});

	app.command("/lounasbotti", async args => {
		args.ack();

		if (args.command.text) {
			console.info(`Received command ${args.command.text} from ${args.command.user_name}`);
			const commandText = args.command.text.trim().toLowerCase();

			if (ADMIN_COMMANDS.some(ac => commandText.startsWith(ac))) {
				if (!settings.adminUsers.includes(args.command.user_id)) {
					console.debug(`User ${args.command.user_id} is not allowed to use admin features`);
					args.respond({
						response_type: "ephemeral",
						text: "You are not allowed to use this feature. This incident will be reported."
					});
					return;
				}
			}

			if (commandText === "restart") {
				args.respond({
					response_type: "ephemeral",
					text: "Okay! Restarting, BRB"
				});
				console.info("Process will now exit due to restart command");
				setTimeout(() => process.exit(), 1000);
				return;
			}
			
			if (commandText === "ping") {
				args.respond({
					response_type: "ephemeral",
					text: "Pong!"
				});
				return;
			}

			if (commandText === "subscribe") {
				if (settings.subscribedChannels?.includes(args.body.channel_id)) {
					args.respond({
						response_type: "ephemeral",
						text: `Lounasbotti is already subscribed to this channel. Use ${Md.codeInline("/lounasbotti unsubscribe")} to unsubscribe.`
					});
					return;
				}

				try {
					await args.client.conversations.join({ channel: args.body.channel_id });
				} catch (error) {
					console.error(error);
					args.respond({
						response_type: "ephemeral",
						text: "Error subscribing to channel. Lounasbotti could not join this channel. Please contact support."
					});
					return;
				}

				SettingsRepository.update({
					instanceId: settings.instanceId,
					$push: {
						subscribedChannels: args.body.channel_id
					}
				}).then(instanceSettings => {
					settings.subscribedChannels = instanceSettings.subscribedChannels;
					console.info(`User ${args.body.user_id} (${args.body.user_name}) subscribed to channel ${args.body.channel_id}`);
					args.respond({
						response_type: "in_channel",
						text: `${Md.user(args.body.user_id)} subscribed Lounasbotti to this channel. Next automatic activation will happen at ${Md.codeInline(global.LOUNASBOTTI_JOBS.subscriptions.nextInvocation().toLocaleString("en-US"))}. Use ${Md.codeInline("/lounasbotti unsubscribe")} to unsubscribe.`
					});
				}).catch(error => {
					console.error(error);
					args.respond({
						response_type: "ephemeral",
						text: "Error subscribing to channel. Please contact support."
					});
				});

				return;
			}

			if (commandText === "unsubscribe") {
				if (!settings.subscribedChannels?.includes(args.body.channel_id)) {
					args.respond({
						response_type: "ephemeral",
						text: `Lounasbotti is not subscribed to this channel. Use ${Md.codeInline("/lounasbotti subscribe")} to subscribe.`
					});
					return;
				}

				SettingsRepository.update({
					instanceId: settings.instanceId,
					$pull: {
						subscribedChannels: args.body.channel_id
					}
				}).then(instanceSettings => {
					settings.subscribedChannels = instanceSettings.subscribedChannels;
					console.info(`User ${args.body.user_id} (${args.body.user_name}) unsubscribed channel ${args.body.channel_id}`);
					args.respond({
						response_type: "in_channel",
						text: `${Md.user(args.body.user_id)} unsubscribed Lounasbotti from this channel. Use ${Md.codeInline("/lounasbotti subscribe")} to subscribe again.`
					});

					args.client.conversations.leave({ channel: args.body.channel_id });
				}).catch(error => {
					console.error(error);
					args.respond({
						response_type: "ephemeral",
						text: "Error unsubscribing from channel. Please contact support."
					});
				});

				return;
			}

			if (commandText === "cache") {
				Utils.clearObject(lounasCache);
				args.respond({
					response_type: "ephemeral",
					text: "OK! Cache cleared"
				});
				return;
			}

			if (commandText === "truncateall") {
				try {
					const toBeTruncated = await LounasRepository.findToBeTruncated(settings.instanceId);
					if (!toBeTruncated.length) {
						args.respond({
							response_type: "ephemeral",
							text: "Nothing to truncate!"
						});
						return;
					}

					args.respond({
						response_type: "ephemeral",
						text: `Okay! Truncating ${toBeTruncated.length} messages!`
					});

					for (const tbt of toBeTruncated) {
						await truncateMessage(app, tbt);
					}
				} catch (error) {
					console.error(error);
					args.respond({
						response_type: "ephemeral",
						text: "Error processing your request. Check logs for more information."
					});
				}

				return;
			}

			if (commandText.startsWith("announce")) {
				const match = ANNOUNCE_REGEXP.exec(args.command.text) ?? [];
				const channelId = match[1];
				const message = match[2];

				if (!channelId || !message) {
					console.debug("No channelId or message provided!");
					args.respond({
						response_type: "ephemeral",
						text: "Invalid syntax: No channel id or message provided!"
					});
					return;
				}

				console.debug(`Announcing on channel ${channelId}`);
				args.client.chat.postMessage({
					channel: channelId,
					text: message.replaceAll("__n__", "\n"),
					unfurl_links: false,
					mrkdwn: true
				}).catch(console.error);
				return;
			}

			if (commandText.startsWith("remark")) {
				const match = REMARK_REGEXP.exec(args.command.text);
				if (!match) {
					args.respond({
						response_type: "ephemeral",
						text: "Error adding remark: Invalid syntax"
					});
					return;
				}

				const operation = match[1];
				const message = match[3];
				
				let regExp;
				try {
					regExp = new RegExp(match[2], "ims");
				} catch {
					console.debug(`Invalid regular expression: ${match[2]}`);
					args.respond({
						response_type: "ephemeral",
						text: "Error adding remark: Invalid regular expression"
					});
					return;
				}

				const mongoOperation = operation === "add"
					? {$addToSet: { remarks: { regExp: regExp, message: message} }}
					: {$pull: { remarks: { regExp: regExp} }}

				SettingsRepository.update({
					instanceId: settings.instanceId,
					...mongoOperation
				}).then(instanceSettings => {
					settings.remarks = instanceSettings.remarks;
					console.info(`User ${args.body.user_id} (${args.body.user_name}) added a new remark`);
					args.respond({
						response_type: "ephemeral",
						text: operation === "add"
							? `Remark added successfully! Use ${Md.codeInline(`/lounasbotti remark remove ${regExp.source}<>confirm`)} to remove.`
							: 'Remark removed successfully!'
					});
				}).catch(error => {
					console.error(error);
					args.respond({
						response_type: "ephemeral",
						text: "Error adding remark. Please contact support."
					});
				});

				return;
			}
		}

		args.respond({
			response_type: "ephemeral",
			text: "Unknown command! See bots Home page for a list of available commands."
		});
	});
}