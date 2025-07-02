import type { UpdateQuery } from "mongoose";
import mongoose from "mongoose";
import type { Restaurant } from "./Settings.js";

type LounasMessageEntry = {
	instanceId: string,
    ts: string,
    channel: string,
    menu: {restaurant: Restaurant, items: string[] | null}[],
    date: Date,
    votes: {userId: string, action: string}[],
	toBeTruncated?: boolean
};

const lounasSchema = new mongoose.Schema<LounasMessageEntry>({
	instanceId: String,
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
	})],
	toBeTruncated: Boolean
});

const LounasMessage = mongoose.model<LounasMessageEntry>("LounasMessage", lounasSchema);

enum OperationType {
	ADD,
	REMOVE
}

// ###

const create = async (lounasMessage: LounasMessageEntry): Promise<LounasMessageEntry> => {
	return await new LounasMessage(lounasMessage).save();
};

const find = async (ts: string, channel: string): Promise<LounasMessageEntry> => {
	const document = await LounasMessage.findOne({ts, channel})
		.maxTimeMS(5000)
		.exec();

	if (!document) {
		throw new Error(`Document with ts ${ts} and channel id ${channel} not found`);
	}

	return document;
};

const findToBeTruncated = async (instanceId: string, maxTimeMS: number = 5000): Promise<{channel: string, ts: string}[]> => {
	return await LounasMessage.find({instanceId, toBeTruncated: true})
		.select(["channel", "ts"])
		.maxTimeMS(maxTimeMS)
		.exec();
};

const markTruncated = (ts: string): void => {
	try {
		LounasMessage.updateOne({ts}, {$unset: {toBeTruncated: true}}).exec();
	} catch (error) {
		console.error("Error marking LounasMessageEntry truncated");
		console.error(error);
	}
};

const addOrRemoveVote = async (ts: string, entry: {userId: string, action: string}, operationType: OperationType): Promise<LounasMessageEntry> => {
	let updateBody: UpdateQuery<LounasMessageEntry>;
	if (operationType === OperationType.ADD) {
		updateBody = {
			"$push": {
				votes: {userId: entry.userId, action: entry.action}
			}
		};
	} else if (operationType === OperationType.REMOVE) {
		updateBody = {
			"$pull": {
				votes: {userId: entry.userId, action: entry.action}
			}
		};
	} else {
		throw new Error(`Unsupported operation type ${operationType}`);
	}

	const document = await LounasMessage.findOneAndUpdate({ts}, updateBody, {new: true})
		.maxTimeMS(5000)
		.exec();

	if (!document) {
		throw new Error("Failed to modify document");
	}

	return document;
};

export { create, find, findToBeTruncated, markTruncated, addOrRemoveVote, LounasMessageEntry, OperationType };