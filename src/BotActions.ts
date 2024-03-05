import type { BlockAction, CheckboxesAction, PlainTextInputAction } from "@slack/bolt";
import type bolt from "@slack/bolt";
import type { Settings } from "./model/Settings.js";
import * as SettingsRepository from "./model/SettingsRepository.js";

export default function(app: bolt.App, settings: Settings) {
	app.action("lounasbotti-updateRegExp", async ({ack, body}) => {
		ack();

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
			console.info(`User ${body.user.id} (${(body.user as any)["name"]}) changed triggerRegExp to "${settings.triggerRegExp.toString()}"`);
		}).catch(error => {
			console.error(error);
			// TODO: Tell user
		});
	});

	app.action("lounasbotti-limitVotesToOne", async ({ack, body}) => {
		ack();
		const isChecked = !!((body as BlockAction).actions[0] as CheckboxesAction).selected_options.length;

		return SettingsRepository.update({
			instanceId: settings.instanceId,
			limitToOneVotePerUser: isChecked
		}).then(instanceSettings => {
			settings.limitToOneVotePerUser = Boolean(instanceSettings.limitToOneVotePerUser);
			console.info(`User ${body.user.id} (${(body.user as any)["name"]}) changed limitToOneVotePerUser to "${settings.limitToOneVotePerUser}"`);
		}).catch(error => {
			console.error(error);
			// TODO: Tell user
		});
	});
}