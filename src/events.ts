import bolt from "@slack/bolt";

const initEvents = (app: bolt.App): void => {
	app.action("githubButtonLinkAction", async ({ack}) => {
		console.debug("GitHub link opened!");
		ack();
	});

	app.action("upvoteButtonAction", async ({ack}) => {
		console.debug("Upvote registered!");
		ack();
	});
};

export { initEvents };