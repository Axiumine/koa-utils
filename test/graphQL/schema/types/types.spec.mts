import { DeleteType, RET_DEL_ROLLBACK } from '@stypes/DeleteType.mjs'
import { DoneType } from '@stypes/DoneType.mjs'
import { FindOneAndUpdateType } from '@stypes/FindOneAndUpdateType.mjs'
import { LoginAppType } from '@stypes/LoginAppType.mjs'
import { LoginType } from '@stypes/LoginType.mjs'
import { MidNameType } from '@stypes/MidNameType.mjs'
import { OnlyIdType } from '@stypes/OnlyIdType.mjs'
import { RefreshType } from '@stypes/RefreshType.mjs'
import { RetStatusMexType } from '@stypes/RetStatusMexType.mjs'
import { RetStatusType } from '@stypes/RetStatusType.mjs'
import { SaveType } from '@stypes/SaveType.mjs'
import { SidNameType } from '@stypes/SidNameType.mjs'
import { SidNomeType } from '@stypes/SidNomeType.mjs'
import { UpdateResultType } from '@stypes/UpdateResultType.mjs'
import { expect } from 'chai'
import {
	GraphQLBoolean,
	GraphQLID,
	GraphQLInt,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLString
} from 'graphql'

import { GraphQLInputLogin } from '../../../../dist/graphQL/schema/GraphQLInput/GraphQLInputLogin.mjs'

function assertField(type: GraphQLObjectType, name: string, expected: unknown) {
	const fields = type.getFields()
	expect(fields[name], `field ${name} missing on ${type.name}`).to.exist
	expect(fields[name].type.toString()).to.equal(String(expected))
}

describe('graphQL/schema/types/*', () => {
	it('DeleteType has acknowledged:Boolean, deletedCount:Int', () => {
		expect(DeleteType.name).to.equal('DeleteType')
		assertField(DeleteType, 'acknowledged', GraphQLBoolean)
		assertField(DeleteType, 'deletedCount', GraphQLInt)
	})

	it('RET_DEL_ROLLBACK = { acknowledged: false, deletedCount: 0 }', () => {
		expect(RET_DEL_ROLLBACK).to.deep.equal({ acknowledged: false, deletedCount: 0 })
	})

	it('DoneType: done:Boolean!, message:String!, _id:ID', () => {
		expect(DoneType.name).to.equal('DoneType')
		assertField(DoneType, 'done', new GraphQLNonNull(GraphQLBoolean))
		assertField(DoneType, 'message', new GraphQLNonNull(GraphQLString))
		assertField(DoneType, '_id', GraphQLID)
	})

	it('FindOneAndUpdateType nests lastErrorObject:FindOneAndUpdateDetailType!', () => {
		expect(FindOneAndUpdateType.name).to.equal('FindOneAndUpdateType')
		const f = FindOneAndUpdateType.getFields().lastErrorObject
		expect(f).to.exist
		expect(f.type.toString()).to.equal('FindOneAndUpdateDetailType!')
	})

	it('LoginAppType: accessToken, onboardingStep, onboardingDone (all NonNull)', () => {
		expect(LoginAppType.name).to.equal('LoginAppType')
		assertField(LoginAppType, 'accessToken', new GraphQLNonNull(GraphQLString))
		assertField(LoginAppType, 'onboardingStep', new GraphQLNonNull(GraphQLString))
		assertField(LoginAppType, 'onboardingDone', new GraphQLNonNull(GraphQLBoolean))
	})

	it('LoginType: accessToken:String!', () => {
		expect(LoginType.name).to.equal('LoginType')
		assertField(LoginType, 'accessToken', new GraphQLNonNull(GraphQLString))
	})

	it('MidNameType: _id:ID!, name:String!', () => {
		expect(MidNameType.name).to.equal('MidNameType')
		assertField(MidNameType, '_id', new GraphQLNonNull(GraphQLID))
		assertField(MidNameType, 'name', new GraphQLNonNull(GraphQLString))
	})

	it('OnlyIdType: _id:ID!', () => {
		expect(OnlyIdType.name).to.equal('OnlyIdType')
		assertField(OnlyIdType, '_id', new GraphQLNonNull(GraphQLID))
	})

	it('RefreshType: status:Boolean!, accessToken:String!', () => {
		expect(RefreshType.name).to.equal('RefreshType')
		assertField(RefreshType, 'status', new GraphQLNonNull(GraphQLBoolean))
		assertField(RefreshType, 'accessToken', new GraphQLNonNull(GraphQLString))
	})

	it('RetStatusMexType: status:String!, mex:String', () => {
		expect(RetStatusMexType.name).to.equal('RetStatusMexType')
		assertField(RetStatusMexType, 'status', new GraphQLNonNull(GraphQLString))
		assertField(RetStatusMexType, 'mex', GraphQLString)
	})

	it('RetStatusType: status:String!', () => {
		expect(RetStatusType.name).to.equal('RetStatusType')
		assertField(RetStatusType, 'status', new GraphQLNonNull(GraphQLString))
	})

	it('SaveType: _id:ID', () => {
		expect(SaveType.name).to.equal('SaveType')
		assertField(SaveType, '_id', GraphQLID)
	})

	it('SidNameType: id:Int!, name:String!', () => {
		expect(SidNameType.name).to.equal('SidNameType')
		assertField(SidNameType, 'id', new GraphQLNonNull(GraphQLInt))
		assertField(SidNameType, 'name', new GraphQLNonNull(GraphQLString))
	})

	it('SidNomeType: id:Int!, nome:String!', () => {
		expect(SidNomeType.name).to.equal('SidNomeType')
		assertField(SidNomeType, 'id', new GraphQLNonNull(GraphQLInt))
		assertField(SidNomeType, 'nome', new GraphQLNonNull(GraphQLString))
	})

	it('UpdateResultType: modifiedCount:Int!', () => {
		expect(UpdateResultType.name).to.equal('UpdateResultType')
		assertField(UpdateResultType, 'modifiedCount', new GraphQLNonNull(GraphQLInt))
	})

	it('GraphQLInputLogin: email:String!, password:String! (input type)', () => {
		expect(GraphQLInputLogin.name).to.equal('GraphQLInputLogin')
		const fields = GraphQLInputLogin.getFields()
		expect(fields.email.type.toString()).to.equal('String!')
		expect(fields.password.type.toString()).to.equal('String!')
	})
})
