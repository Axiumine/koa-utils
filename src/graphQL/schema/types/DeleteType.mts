import { GraphQLBoolean, GraphQLInt, GraphQLObjectType } from 'graphql'

export const DeleteType = new GraphQLObjectType({
	name: 'DeleteType',
	fields: () => ({
		acknowledged: { type: GraphQLBoolean },
		deletedCount: { type: GraphQLInt }
	})
})

export const RET_DEL_ROLLBACK = {
	acknowledged: false,
	deletedCount: 0
}
