import { GraphQLBoolean, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'

// returns null id if it fails to save
export const LoginAppType = new GraphQLObjectType({
	name: 'LoginAppType',
	fields: () => ({
		accessToken: { type: new GraphQLNonNull(GraphQLString) },
		onboardingStep: { type: new GraphQLNonNull(GraphQLString) },
		onboardingDone: { type: new GraphQLNonNull(GraphQLBoolean) }
	})
})
