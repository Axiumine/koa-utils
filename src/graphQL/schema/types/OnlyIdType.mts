import { GraphQLID, GraphQLNonNull, GraphQLObjectType } from 'graphql'

export const OnlyIdType = new GraphQLObjectType({
	name: 'OnlyIdType',
	fields: () => ({
		_id: { type: new GraphQLNonNull(GraphQLID) }
	})
})
