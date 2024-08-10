import type { UpdateQuery } from "mongoose";
import mongoose from "mongoose";
import type { InstanceSettings } from "./Settings.js";

const instanceSettingsSchema = new mongoose.Schema<InstanceSettings>({
	instanceId: String,
	limitToOneVotePerUser: Boolean,
	subscribedChannels: [String]
});

const InstanceSettingsModel = mongoose.model<InstanceSettings>("InstanceSettings", instanceSettingsSchema);

// ###

const findOrCreate = async (instanceId: string): Promise<InstanceSettings> => {
	const json = await InstanceSettingsModel.findOneAndUpdate(
		{instanceId},
		{},
		{
			returnDocument: "after",
			lean: true,
			upsert: true
		}
	).maxTimeMS(5000).exec();

	if (!json) {
		throw new Error("No document was returned!");
	}

	return {
		instanceId: json.instanceId,
		limitToOneVotePerUser: Boolean(json.limitToOneVotePerUser),
		subscribedChannels: json.subscribedChannels
	};
};

const update = async (update: InstanceSettings | UpdateQuery<InstanceSettings>): Promise<InstanceSettings> => {
	const actualUpdate: UpdateQuery<InstanceSettings> = {...update};

	const json = await InstanceSettingsModel.findOneAndUpdate(
		{instanceId: update.instanceId},
		actualUpdate,
		{
			returnDocument: "after",
			lean: true,
		}
	).maxTimeMS(5000).exec();

	if (!json) {
		throw new Error("No document was returned!");
	}

	return {
		instanceId: json.instanceId,
		limitToOneVotePerUser: Boolean(json.limitToOneVotePerUser),
		subscribedChannels: json.subscribedChannels
	};
};

export { findOrCreate, update };