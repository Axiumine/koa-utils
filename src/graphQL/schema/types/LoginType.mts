import { GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

// returns null id if it fails to save
export const LoginType = new GraphQLObjectType({
	name: 'LoginType',
	fields: () => ({
		accessToken: { type: new GraphQLNonNull(GraphQLString) }
	})
})
