import type { BlockAction, CheckboxesAction } from "@slack/bolt";
import type bolt from "@slack/bolt";
import type { Settings } from "./model/Settings.js";
import * as SettingsRepository from "./model/SettingsRepository.js";

export default function(app: bolt.App, settings: Settings) {
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