import { GraphQLID, GraphQLObjectType } from 'graphql'

// returns null id if it fails to save
export const SaveType = new GraphQLObjectType({
	name: 'SaveType',
	fields: () => ({
		_id: { type: GraphQLID }
	})
})
