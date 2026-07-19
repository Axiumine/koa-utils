import { Types } from 'mongoose'

/**
 * Use like this:
 * const result = await Model.findByIdAndUpdate(...) as IFindAndUpdate<IImprenditoreModel>;
 * result.value; // IImprenditoreModel | null
 *
 * If you do not need the new or the old document, use updateOne() !
 */
export interface IFindAndUpdate<T = unknown> {
	value: T | null // The document
	lastErrorObject: {
		updatedExisting: boolean // Indicates whether it updated an existing document (true) or created a new one via
		// 	upsert (false)
		upserted?: Types.ObjectId // Present only if an upsert occurred
	}
	ok: 0 | 1 // indicates whether the MongoDB command succeeded (1) or had an error (0). If the
	// 	document was not found, ok is 1 because the command succeeded !! so
	// 	check if value is not null to verify the document was found
}
