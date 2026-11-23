// gltf-validator ships no types. Only what src/private/glb/validateKhronos.mts reads is declared.
declare module 'gltf-validator' {
	interface IValidatorMessage {
		code: string
		message: string
		/** 0 error, 1 warning, 2 info, 3 hint */
		severity: number
		pointer?: string
	}

	interface IValidatorReport {
		issues: { numErrors: number; messages: IValidatorMessage[] }
	}

	interface IValidatorOptions {
		maxIssues?: number
	}

	const validator: {
		validateBytes(data: Uint8Array, options?: IValidatorOptions): Promise<IValidatorReport>
	}

	export default validator
}
