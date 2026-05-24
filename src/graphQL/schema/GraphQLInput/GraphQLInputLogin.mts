import { GraphQLInputObjectType, GraphQLNonNull, GraphQLString } from 'graphql'

export const GraphQLInputLogin = new GraphQLInputObjectType({
	name: 'GraphQLInputLogin',
	fields: () => ({
		email: { type: new GraphQLNonNull(GraphQLString) },
		password: { type: new GraphQLNonNull(GraphQLString) }
	})
})
