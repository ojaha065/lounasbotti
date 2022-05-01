import bolt, { BlockAction, PlainTextInputAction } from "@slack/bolt";
import { Settings } from "model/Settings";
import * as SettingsRepository from "./model/SettingsRepository.js";

export default function(app: bolt.App, settings: Settings) {
	app.action("lounasbotti-updateRegExp", async ({ack, body}) => {
		ack();

		if (settings.debug?.noDb) {
			console.warn("Database connection is disabled by debug config");
			settings.triggerRegExp = new RegExp(((body as BlockAction).actions[0] as PlainTextInputAction).value, "i");
			return;
		}

		new Promise((resolve: (value: RegExp) => void) => {
			resolve(new RegExp(((body as BlockAction).actions[0] as PlainTextInputAction).value, "i")); // TODO: Validate?
		}).then(regExp => {
			return SettingsRepository.update({
				instanceId: settings.instanceId,
				triggerRegExp: regExp
			});
		}).then(instanceSettings => {
			if (!instanceSettings.triggerRegExp) {
				throw new Error("Instance settings missing value!");
			}

			settings.triggerRegExp = instanceSettings.triggerRegExp;
			console.info(`User ${body.user.id} changed triggerRegExp to "${settings.triggerRegExp.toString()}"`);
		}).catch(error => {
			console.error(error);
			// TODO: Tell user
		});
	});
}