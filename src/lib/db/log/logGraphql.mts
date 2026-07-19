import { LogStatsGraphql } from '@models/MongoDB/log/LogStatsGraphql.mjs'
import { Types } from 'mongoose'

/**
 * Logs operations performed by users
 * @param owner
 * @param nome
 * @param status
 * @param msTot
 */
export const logGraphql = function (owner: Types.ObjectId, nome: string, status: number, msTot: number) {
	new LogStatsGraphql({
		owner,
		nome,
		status,
		msTot
	})
	/*
  return new Promise((resolve, reject) => {
    newStatsGraphql.save((err: any, res: any) => {
      if (err) {
        reject('Errore log.' + err)
      } else {
        resolve(res)
      }
    })
  }) */
}
