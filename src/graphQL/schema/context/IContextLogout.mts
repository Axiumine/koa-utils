import { TCommonHeaders } from '@context/TCommonHeaders.mjs'
import { ICookies } from '@lib/ICookies.mjs'
import { IncomingHttpHeaders } from 'http'

interface ISessionApi {
	refreshToken: string; // 90 days - cookie
	accessToken?: string; // 90 min - headers
}

type IStateApi = {
	user: ISessionApi;
};

export type IContextLogout = {
	state: IStateApi;
	cookies: ICookies;
	request: {
		header?: TCommonHeaders & IncomingHttpHeaders
	}
};
