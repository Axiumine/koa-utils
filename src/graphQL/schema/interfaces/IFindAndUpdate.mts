import { Types } from 'mongoose'

/**
 * Use like this:
 * const result = await Model.findByIdAndUpdate(...) as IFindAndUpdate<IImprenditoreModel>;
 * result.value; // IImprenditoreModel | null
 *
 * If you do not need the new or the old document, use updateOne() !
 */
export interface IFindAndUpdate<T = unknown>  {
	value: T | null 						// Il documento
	lastErrorObject: {
		updatedExisting: boolean, // Indica se ha aggiornato un documento esistente (true) o ne ha creato uno nuovo via
															// 	upsert (false)
		upserted?: Types.ObjectId // Presente solo se upsert avvenuto
	},
	ok: 0 | 1 									// indica se il comando MongoDB è andato a buon fine (1) o ha avuto un errore (0). Se il
															// 	documento non è stato trovato, ok è 1 perchè il comando è andato a buon fine !! quindi
															// 	controllare se value non è null per controllare che il documento sia stato trovato
}

