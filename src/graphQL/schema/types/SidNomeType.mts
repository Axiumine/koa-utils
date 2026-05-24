import { GraphQLInt, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

/**
 * MariaDB id & nome
 */
export const SidNomeType = new GraphQLObjectType({
	name: 'SidNomeType',
	fields: () => ({
		id: { type: new GraphQLNonNull(GraphQLInt) },
		nome: { type: new GraphQLNonNull(GraphQLString) }
	})
})
