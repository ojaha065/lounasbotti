import dotenv from "dotenv";
dotenv.config();

import http from "http";

import fetch from "node-fetch";
import bolt from "@slack/bolt";
import { LounasDataProvider, LounasResponse } from "model/LounasDataProvider.js";

import RuokapaikkaFiDataProvider from "./model/RuokapaikkaFiDataProvider.js";
import { Restaurant, RestaurantNameMap, Settings } from "./model/Settings.js";

const VERSION = "1.0.3";
console.info(`Lounasbotti v${VERSION} server starting...`);

process.on("unhandledRejection", error => {
	throw error;
});

if (!process.env["SLACK_SECRET"] || !process.env["SLACK_TOKEN"]) {
	throw new Error("Missing required parameter(s)");
}

const { App } = bolt;

// TODO: Read settings from JSON file
const settings: Settings = {
	dataProvider: "ruokapaikkaFi",
	userAgent: "Mozilla/5.0 (compatible; Lounasbotti/1.0;)",
	defaultRestaurants: [Restaurant.savo, Restaurant.talli, Restaurant.rami, Restaurant.august],
	gitUrl: "https://github.com/ojaha065/lounasbotti"
};

let dataProvider: LounasDataProvider;

switch (settings.dataProvider) {
	case "ruokapaikkaFi":
		dataProvider = new RuokapaikkaFiDataProvider(settings);
		break;
	default:
		throw new Error(`Unknown data provider ${settings.dataProvider}`);
}

const app = new App({
	signingSecret: process.env["SLACK_SECRET"],
	token: process.env["SLACK_TOKEN"],
	socketMode: process.env["SLACK_SOCKET"] as unknown as boolean || false,
	appToken: process.env["SLACK_APP_TOKEN"] || ""
});

app.message("!ping", async ({say}) => {
	say("Pong!");
});

app.message(/!(lounas|ruokaa)/, async ({say, message}) => {
	const data: LounasResponse[] = await dataProvider.getData(settings.defaultRestaurants);
	const header = `Lounaslistat${data.length && data[0].date ? ` (${data[0].date})` : ""}`;

	if (!message.subtype) {
		say({
			text: header, // Fallback for notifications
			blocks: [{
				type: "header",
				text: {
					type: "plain_text",
					text: header
				}
			}, ...data.map(lounasResponse => {
				return {
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${RestaurantNameMap[lounasResponse.restaurant]}*\n${((lounasResponse .items || [lounasResponse .error]).map(item => `  * ${item}`).join("\n"))}`
					}
				};
			}), {
				type: "divider"
			}, {
				type: "context",
				elements: [
					{
						type: "mrkdwn",
						text: `Pyynnön lähetti <@${message.user}>\n_Ongelmia botin toiminnassa? Ping @Jani_`
					},
				]
				
			}]
		});
	}
});

// Home tab
app.event("app_home_opened", async ({client, event}) => {
	try {
		await client.views.publish({
			user_id: event.user,
			view: {
				type: "home",
				blocks: [
					{
						type: "header",
						text: {
							type: "plain_text",
							text: `Lounasbotti V${VERSION}`
						}
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: "_By @Jani_"
						}
					},
					{
						type: "divider"
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `Tervehdys <@${event.user}>, nimeni on Lounasbotti. Kutsu minua komennoilla *!lounas* tai *!ruokaa* millä tahansa kanavalla, jonne minut on kutsuttu ja haen päivän lounaslistat valonnopeudella! _...tai ainakin yritän..._`
						}
					},
					{
						type: "section",
						text: {
							type: "plain_text",
							text: "Voit myös avata yksityisen chatin kanssani ja käyttää edellä mainittuja komentoja siellä."
						}
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: "_Olen vielä beta-versio, mutta voit auttaa minua kehittymään paremmaksi_ -->"
						},
						accessory: {
							type: "button",
							text: {
								type: "plain_text",
								text: ":link: GitHub",
								emoji: true
							},
							url: "https://github.com/ojaha065/lounasbotti"
						}
					}
				]
			}
		});
	} catch (error) {
		console.error(error);
	}
});

const botPort = 3000;
const webPort: number = (process.env["PORT"] || 8080) as unknown as number;
app.start(botPort).then(() => {
	console.info(`Lounasbotti server started on port ${botPort}`);

	// Keep Heroku free Dyno running
	if (process.env["HEROKU_INSTANCE_URL"]) {
		http.createServer((_req, res) => {
			res.writeHead(204).end();
		}).listen(webPort, () => {
			console.info(`Web server started on port ${webPort}`);
			setInterval(() => {
				fetch(process.env["HEROKU_INSTANCE_URL"] || "", {
					method: "GET"
				});
			}, 1000 * 60 * 10);
		});
	}
});