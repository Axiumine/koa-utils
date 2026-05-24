import { TCommonHeaders } from '@context/TCommonHeaders.mjs'
import { IncomingHttpHeaders } from 'http'
import { Types } from 'mongoose'

interface ISessionApi {
	id: Types.ObjectId;
	// disabled?: boolean | 'true'; // no need to read this, user is blocked at resource handler level defined only if true or 'true'
	// deleted?: boolean | 'true'; // no need to read this, user is blocked at resource handler level defined only if true or 'true'
}

type IStateApi = {
	user: ISessionApi;
};

export type IContextAuthenticatedResource = {
	state: IStateApi;
	request: {
		header?: TCommonHeaders & IncomingHttpHeaders
	}
};
