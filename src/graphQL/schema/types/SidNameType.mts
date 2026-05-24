import { GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

/**
 * MariaDB id & name
 */
export const SidNameType = new GraphQLObjectType({
	name: 'SidNameType',
	fields: () => ({
		id: { type: new GraphQLNonNull(GraphQLInt) },
		name: { type: new GraphQLNonNull(GraphQLString) }
	})
})
