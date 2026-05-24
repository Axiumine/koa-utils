import { TCommonHeaders } from '@context/TCommonHeaders.mjs'
import { ICookies } from '@lib/ICookies.mjs'
import { IncomingHttpHeaders } from 'http'
import { Types } from 'mongoose'

interface ISessionAuthenticated {
	id: Types.ObjectId;
	refreshToken: string;
	// disabled?: boolean | 'true'; // no need to read this, user is blocked at resource handler level defined only if true or 'true'
	// deleted?: boolean | 'true'; // no need to read this, user is blocked at resource handler level defined only if true or 'true'
}

type IStateAuthenticated = {
	user: ISessionAuthenticated;
};

export type IContextRefresh = {
	state: IStateAuthenticated;
	cookies: ICookies;
	request: {
		header?: TCommonHeaders & IncomingHttpHeaders
	}
};
