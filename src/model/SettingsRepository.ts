import mongoose from "mongoose";
import { InstanceSettings } from "./Settings";

const instanceSettingsSchema = new mongoose.Schema<InstanceSettings>({
	instanceId: String,
	triggerRegExp: String,
	limitToOneVotePerUser: Boolean
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
		limitToOneVotePerUser: Boolean(json.limitToOneVotePerUser)
	};
};

const update = async (update: InstanceSettings): Promise<InstanceSettings> => {
	const actualUpdate: any = {...update};
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
		limitToOneVotePerUser: Boolean(json.limitToOneVotePerUser)
	};
};

export { findOrCreate, update };