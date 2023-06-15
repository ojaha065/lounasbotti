import bolt from "@slack/bolt";

export default function(app: bolt.App) {
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

			if (args.command.text.trim().toLowerCase() === "restart") {
				args.respond({
					response_type: "ephemeral",
					text: "Okay! Restarting, BRB"
				});
				console.info("Process will now exit due to restart command");
				setTimeout(() => process.exit(), 1000);
				return;
			}
			
			if (args.command.text.trim().toLowerCase() === "ping") {
				args.respond({
					response_type: "ephemeral",
					text: "Pong!"
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