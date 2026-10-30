import { expect } from 'chai'

import type { Measurement } from './measure.mts'
import {
	compare,
	formatVerdict,
	isClean,
	keyOf,
	label,
	lower,
	parseBaseline,
	serializeBaseline,
	toBaseline
} from './ratchet.mts'

const m = (symbol: string, value: number, cap: Measurement['cap'] = 'params', path = 'src/a.mts'): Measurement => ({
	cap,
	path,
	symbol,
	value
})

describe('keyOf / toBaseline', () => {
	it('joins cap, path and symbol, with no line number', () => {
		expect(keyOf(m('A>b', 5))).to.equal('params|src/a.mts|A>b')
	})

	it('builds a baseline sorted by key', () => {
		const baseline = toBaseline([m('z', 5), m('a', 6)])
		expect(Object.keys(baseline)).to.deep.equal(['params|src/a.mts|a', 'params|src/a.mts|z'])
		expect(baseline['params|src/a.mts|a']).to.equal(6)
	})
})

describe('parseBaseline minimum', () => {
	it('accepts 1 as the smallest value and rejects 0, negatives and fractions', () => {
		expect(parseBaseline('{"a":1}')).to.deep.equal({ a: 1 })
		for (const bad of ['{"a":0}', '{"a":-1}', '{"a":1.5}']) {
			expect(() => parseBaseline(bad), bad).to.throw('must be a positive integer')
		}
	})
})

describe('parseBaseline / serializeBaseline', () => {
	it('round-trips, tab-indented with a trailing newline', () => {
		const baseline = { 'params|src/a.mts|f': 5 }
		const text = serializeBaseline(baseline)
		expect(text).to.equal('{\n\t"params|src/a.mts|f": 5\n}\n')
		expect(parseBaseline(text)).to.deep.equal(baseline)
	})

	it('rejects anything that is not an object of positive integers', () => {
		expect(() => parseBaseline('not json')).to.throw()
		for (const bad of ['[]', 'null', '3', '"x"']) {
			expect(() => parseBaseline(bad), bad).to.throw('JSON object')
		}
		for (const bad of ['0', '1.5', '"5"', 'null']) {
			expect(() => parseBaseline(`{"k": ${bad}}`), bad).to.throw('positive integer')
		}
	})
})

describe('compare / isClean', () => {
	const baseline = { 'params|src/a.mts|f': 5 }

	it('equal value is tolerated', () => {
		const verdict = compare([m('f', 5)], baseline)
		expect(isClean(verdict)).to.equal(true)
	})

	it('a key absent from the baseline is new', () => {
		const verdict = compare([m('f', 5), m('g', 6)], baseline)
		expect(verdict.added).to.deep.equal([m('g', 6)])
		expect(isClean(verdict)).to.equal(false)
	})

	it('a value above the baseline is grown', () => {
		const verdict = compare([m('f', 6)], baseline)
		expect(verdict.grown).to.deep.equal([{ measurement: m('f', 6), baseline: 5 }])
		expect(isClean(verdict)).to.equal(false)
	})

	it('a value below the baseline is stale', () => {
		const verdict = compare([m('f', 4.5)], baseline)
		expect(verdict.stale).to.deep.equal([{ key: 'params|src/a.mts|f', measurement: m('f', 4.5), baseline: 5 }])
		expect(isClean(verdict)).to.equal(false)
	})

	it('a baselined key that vanished is stale', () => {
		const verdict = compare([], baseline)
		expect(verdict.stale).to.deep.equal([{ key: 'params|src/a.mts|f', measurement: undefined, baseline: 5 }])
		expect(isClean(verdict)).to.equal(false)
	})

	it('an empty baseline and no violations is clean', () => {
		expect(isClean(compare([], {}))).to.equal(true)
	})
})

describe('lower', () => {
	it('lowers a value, drops a vanished key, keeps an equal one', () => {
		const baseline = { 'params|src/a.mts|a': 7, 'params|src/a.mts|b': 5, 'params|src/a.mts|c': 5 }
		expect(lower([m('a', 6), m('b', 5)], baseline)).to.deep.equal({ 'params|src/a.mts|a': 6, 'params|src/a.mts|b': 5 })
	})

	it('never raises a value and never adds a key', () => {
		const baseline = { 'params|src/a.mts|a': 5 }
		expect(lower([m('a', 9), m('new', 8)], baseline)).to.deep.equal(baseline)
	})
})

describe('label / formatVerdict', () => {
	it('names every offender as: cap path symbol value>limit', () => {
		expect(label(m('A>b', 5))).to.equal('params src/a.mts A>b 5>4')
		expect(label(m('(file)', 612, 'file-lines'))).to.equal('file-lines src/a.mts (file) 612>500')
	})

	it('prints NEW, GROWN and both kinds of STALE with the fixing hint', () => {
		const verdict = compare([m('added', 5), m('grown', 7), m('lower', 5)], {
			'params|src/a.mts|grown': 5,
			'params|src/a.mts|lower': 6,
			'params|src/a.mts|gone': 5
		})
		const out = formatVerdict(verdict)
		expect(out).to.have.length(4)
		expect(out[0]).to.match(/^NEW {3}params src\/a\.mts added 5>4/)
		expect(out[1]).to.match(/^GROWN params src\/a\.mts grown 7>4 \(baseline 5/)
		expect(out[2]).to.equal('STALE params src/a.mts lower 5>4 (baseline 6): run yarn caps:update')
		expect(out[3]).to.equal('STALE params src/a.mts gone gone (baseline 5): run yarn caps:update')
	})
})
