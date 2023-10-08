import mongoose, { UpdateQuery } from "mongoose";
import { InstanceSettings } from "./Settings";

const instanceSettingsSchema = new mongoose.Schema<InstanceSettings>({
	instanceId: String,
	triggerRegExp: String,
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
		triggerRegExp: json.triggerRegExp ? new RegExp(json.triggerRegExp, "i") : undefined,
		limitToOneVotePerUser: Boolean(json.limitToOneVotePerUser),
		subscribedChannels: json.subscribedChannels
	};
};

const update = async (update: InstanceSettings | UpdateQuery<InstanceSettings>): Promise<InstanceSettings> => {
	const actualUpdate: UpdateQuery<InstanceSettings> = {...update};
	if (update.triggerRegExp) {
		actualUpdate.triggerRegExp = update.triggerRegExp.source;
	}

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
		triggerRegExp: json.triggerRegExp ? new RegExp(json.triggerRegExp, "i") : undefined,
		limitToOneVotePerUser: Boolean(json.limitToOneVotePerUser),
		subscribedChannels: json.subscribedChannels
	};
};

export { findOrCreate, update };