import mongoose from "mongoose";
import { Restaurant } from "./Settings";

type LounasMessageEntry = {
    ts: string,
    channel: string,
    menu: {restaurant: Restaurant, items: string[] | null}[],
    date: Date,
    votes: {userId: string, action: string}[]
};

const init = (url: string) => {
	mongoose.connect(url, {
		socketTimeoutMS: 10000
	}).then(() => console.debug("Connection to MongoDB opened successfully"));
}; 

const lounasSchema = new mongoose.Schema<LounasMessageEntry>({
	ts: String,
	channel: String,
	menu: [new mongoose.Schema({
		restaurant: String,
		items: [String]
	})],
	date: Date,
	votes: [new mongoose.Schema({
		userId: String,
		action: String
	})]
});

const LounasMessage = mongoose.model<LounasMessageEntry>("LounasMessage", lounasSchema);

// ###

const create = async (lounasMessage: LounasMessageEntry): Promise<LounasMessageEntry> => {
	return await new LounasMessage(lounasMessage).save();
};

const find = async (ts: string, channel: string): Promise<LounasMessageEntry> => {
	return new Promise((resolve, reject) => {
		LounasMessage.findOne({ts, channel})
			.maxTimeMS(5000)
			.exec((error, document) => {
				if (error) {
					return reject(error);
				}
				if (!document) {
					return reject(new Error(`Document with ts ${ts} and channel id ${channel} not found`));
				}
				resolve(document);
			});
	});
};

const addVote = async (ts: string, userId: string, action: string): Promise<LounasMessageEntry> => {
	return new Promise<LounasMessageEntry>((resolve, reject) => {
		LounasMessage.findOneAndUpdate({ts}, {
			"$push": {
				votes: {userId, action}
			}
		}, {new: true})
			.maxTimeMS(5000)
			.exec((error, document) => {
				if (error) {
					return reject(error);
				}
				if (!document) {
					return reject(new Error("Failed to modify document"));
				}

				resolve(document);
			});
	});
};

export { init, create, find, addVote, LounasMessageEntry };