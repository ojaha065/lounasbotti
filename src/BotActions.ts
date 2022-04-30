import bolt, { BlockAction, PlainTextInputAction } from "@slack/bolt";
import { Settings } from "model/Settings";

export default function(app: bolt.App, settings: Settings) {
	app.action("lounasbotti-updateRegExp", async ({ack, body}) => {
		try {
			// TODO: Validate?
			const newRegExp = new RegExp(((body as BlockAction).actions[0] as PlainTextInputAction).value, "i");
			settings.triggerRegExp = newRegExp;
			console.info(`User ${body.user.id} changed triggerRegExp to "${newRegExp.toString()}"`);
		} catch (error) {
			console.error(error);
		} finally {
			ack();
		}
	});
}