import { GraphQLID, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

/**
 * MongoDB _id & name
 */
export const MidNameType = new GraphQLObjectType({
	name: 'MidNameType',
	fields: () => ({
		_id: { type: new GraphQLNonNull(GraphQLID) },
		name: { type: new GraphQLNonNull(GraphQLString) }
	})
})
