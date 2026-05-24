import { GraphQLBoolean, GraphQLID, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

export const DoneType = new GraphQLObjectType({
	name: 'DoneType',
	fields: () => ({
		done: { type: new GraphQLNonNull(GraphQLBoolean) },
		message: { type: new GraphQLNonNull(GraphQLString) },
		_id: { type: GraphQLID }
	})
})
