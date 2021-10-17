import mongoose from "mongoose";

const init = (url: string) => {
	mongoose.connect(url, {
		socketTimeoutMS: 10000
	}).then(() => console.debug("Connection to MongoDB opened successfully"));
}; 

const lounasSchema = new mongoose.Schema<LounasMessageEntry>({
	ts: String,
	votes: [new mongoose.Schema({
		userId: String,
		action: String
	})]
});

const LounasMessage = mongoose.model<LounasMessageEntry>("LounasMessage", lounasSchema);

// ###

const create = async (ts: string): Promise<LounasMessageEntry> => {
	return await new LounasMessage({
		ts: ts,
		votes: []
	}).save();
};

const findByTs = async (ts: string): Promise<LounasMessageEntry> => {
	return new Promise((resolve, reject) => {
		LounasMessage.findOne({ts})
			.maxTimeMS(5000)
			.exec((error, document) => {
				if (error) {
					return reject(error);
				}
				if (!document) {
					return reject(new Error(`Document with ts ${ts} not found`));
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
			.exec((error, document)=> {
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

export { init, create, findByTs, addVote };