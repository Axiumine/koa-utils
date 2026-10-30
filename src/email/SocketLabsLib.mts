import * as account from '@private/email/accountMessages.mjs'
import { escapeHtml } from '@private/email/escapeHtml.mjs'
import {
	FALLBACK_FOOTER,
	FALLBACK_HEADER_1,
	FALLBACK_HEADER_2,
	orFallback,
	standaloneHeader
} from '@private/email/htmlFrame.mjs'
import type { IEmailContent } from '@private/email/IEmailContent.mjs'
import { confirmationLink } from '@private/email/messageParts.mjs'
import * as notice from '@private/email/noticeMessages.mjs'
import { orFalse } from '@private/email/orFalse.mjs'
import * as reset from '@private/email/resetMessages.mjs'
import * as Sentry from '@sentry/node'
import { BasicMessage, SocketLabsClient } from '@socketlabs/email'
import * as dotenv from 'dotenv'

dotenv.config()

interface IUserInfo {
	_id: string
	personalData: {
		name: string
		surname: string
	}
}

export class SocketLabsLib {
	private readonly platformName: string
	private readonly linkBase: string
	private readonly emailFrom: string
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- @socketlabs/email ships no types (untyped module in src/types/socketlabs-email.d.ts), so the client is untyped
	private client: any
	private readonly emailHtmlHeader1: string
	private readonly emailHtmlHeader2: string
	private readonly emailHtmlFooter: string

	constructor(htmlHeader1: string = '', htmlHeader2: string = '', htmlFooter: string = '') {
		this.client = new SocketLabsClient(
			/* c8 ignore next -- env fallback '0' covered only when SOCKETLABS_SERVER_ID is unset */
			parseInt(process.env['SOCKETLABS_SERVER_ID'] || '0'),
			`${process.env['SOCKETLABS_SERVER_APIKEY']}`,
			{ requestTimeout: 120, numberOfRetries: 3 }
		)
		this.platformName = `${process.env['PLATFORM_NAME']}`
		this.linkBase = `${process.env['APP_DOMAIN']}`
		this.emailFrom = `${process.env['EMAIL_FROM']}`

		this.emailHtmlHeader1 = orFallback(htmlHeader1, FALLBACK_HEADER_1)
		this.emailHtmlHeader2 = orFallback(htmlHeader2, FALLBACK_HEADER_2)
		this.emailHtmlFooter = orFallback(htmlFooter, FALLBACK_FOOTER)
	}

	/**
	 * Send the registration confirmation link.
	 *
	 * `linkBase` and `linkPath` exist because one process can serve more than one audience, and the
	 * confirmation link of each has to land on that audience's own domain. Every other link in this class
	 * is built from `APP_DOMAIN`, read once in the constructor — which is correct while a deployment has a
	 * single front-end, and wrong the moment a second one (a customer site next to an operator panel, say)
	 * registers accounts through the same backend. Passing the base per call is the smallest thing that
	 * makes both links expressible without a second process or a second env read.
	 *
	 * Both are optional and default to the previous behaviour exactly, so every existing caller is
	 * unaffected. A trailing slash on `linkBase` and a missing leading slash on `linkPath` are both
	 * normalised away — the caller supplies configuration, not a pre-joined URL, and `//check` or
	 * `example.comcheck` are not errors worth surfacing to a user mid-registration.
	 *
	 * @param emailTo recipient, also embedded in the link (URI-encoded)
	 * @param hash the activation hash stored on the account
	 * @param name optional greeting name
	 * @param linkBase scheme + host the link points at; defaults to `APP_DOMAIN`
	 * @param linkPath route prefix the receiving service listens on; defaults to `/check/verify-email`
	 */
	// eslint-disable-next-line max-params -- public signature, an options object would break consumers
	async sendEmailVerify(
		emailTo: string,
		hash: string,
		name: string = '',
		linkBase: string = this.linkBase,
		linkPath: string = '/check/verify-email'
	) {
		const link = confirmationLink(linkBase, linkPath, emailTo, hash)
		return await this.sendTemplate(emailTo, account.verifyMessage(this.platformName, link, name))
	}

	/*
  async sendEmailPostReported(userInfo, idPost) {
    const subject = 'Post ' + idPost + ' reported'

    const messageTxt =
      'Hello, post ' +
      idPost +
      ' has been reported by ' +
      userInfo.personalData.name +
      ' ' +
      userInfo.personalData.surname +
      ' (id: ' +
      userInfo._id +
      ').'

    const messageHtml =
      this.getHtmlHeader(subject) +
      'Hello, post ' +
      idPost +
      ' has been reported by ' +
      userInfo.personalData.name +
      ' ' +
      userInfo.personalData.surname +
      ' (id: ' +
      userInfo._id +
      ').' +
      this.getHtmlFooter()

    const message = {
      emailFrom: this.emailFrom,
      emailFromName: this.platformName,
      emailTo: 'dummy@example.com',
      subject,
      textBody: messageTxt,
      htmlBody: messageHtml
    }
    return await this.sendEmail(message)
  }
*/
	/**
	 * @fixme handle retry
	 *
statusCode: ECONNABORTED
Error in sending the email
SendResponse {
  transactionReceipt: null,
  addressResults: null,
  result: {
    name: 'Timeout',
    value: 1,
    message: 'A timeout occurred sending the message'
  },
  responseMessage: 'A timeout occurred sending the message'
}
	 */

	async sendEmailChangeVerify(emailTo: string, hash: string, name: string = '') {
		const link = `${this.linkBase}/check/verify-change-email/${encodeURI(emailTo)}/${hash}`
		return await this.sendTemplate(emailTo, account.changeVerifyMessage(this.platformName, link, name))
	}

	async sendWelcome(emailTo: string) {
		return await this.sendTemplate(emailTo, account.welcomeMessage(this.platformName, this.linkBase))
	}

	/**
	 * Send account disabled notification
	 * @param emailTo
	 */
	async accountDisabled(emailTo: string) {
		return await this.sendTemplate(emailTo, notice.ACCOUNT_DISABLED)
	}

	/**
	 * Send account disabled notification
	 * @param emailTo
	 */
	async accountBanned(emailTo: string) {
		return await this.sendTemplate(emailTo, notice.ACCOUNT_BANNED)
	}

	/**
	 * alertDevTeam
	 * @param err
	 */
	async alertDevTeam(err: string) {
		return await this.sendTemplate(`${process.env['DEV_TEAM_EMAIL']}`, notice.alertDevMessage(this.platformName, err))
	}

	/**
	 *
	 * @param emailTo
	 * @param times
	 */
	async wrongHash(emailTo: string, times: number) {
		return await this.sendTemplate(emailTo, notice.wrongHashMessage(times))
	}

	/*****************
	 * Too much verify requests
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async tooMuchVerifyRequests(emailTo: string) {
		return await this.sendTemplate(emailTo, notice.TOO_MUCH_VERIFY_REQUESTS)
	}

	/*****************
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async hashReqTooOld(emailTo: string) {
		return await this.sendTemplate(emailTo, notice.HASH_REQ_TOO_OLD)
	}

	/*****************
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async emailAlreadyValid(emailTo: string) {
		return await this.sendTemplate(emailTo, notice.EMAIL_ALREADY_VALID)
	}

	/**
	 * Send subscription email
	 * @param emailTo
	 * @param otp
	 */
	async sendSubscriptionEmail(emailTo: string, otp: string) {
		return await this.sendTemplate(emailTo, account.subscriptionMessage(this.platformName, this.linkBase, otp))
	}

	async sendResetPwdConfirmation(emailTo: string, name: string = '') {
		return await this.sendTemplate(emailTo, reset.resetConfirmationMessage(this.platformName, this.linkBase, name))
	}

	async sendResetPwdConfirmationHash(email: string, name: string, hash: string): Promise<boolean> {
		const content = reset.resetConfirmationHashMessage(this.platformName, this.linkBase, { email, name, hash })
		return await orFalse(() => this.sendTemplate(email, content))
	}

	/**
	 * Send the password-reset link.
	 *
	 * `linkBase` and `linkPath` are here for the same reason they are on {@link sendEmailVerify}, and the
	 * pair has to move together: an account that confirmed its address on one front end and then resets its
	 * password on another has been sent to two different sites for two halves of the same login. Both
	 * default to the previous behaviour — `APP_DOMAIN` and `/x/reset` — so no existing caller changes.
	 *
	 * ⚠️ Unlike the verification link, this one is consumed by a **front-end route**, not by a backend
	 * router: the page reads the email and the hash out of its own path and calls `updatePwd`. `linkPath`
	 * therefore names a route in whatever app `linkBase` serves, and the two have to agree with that app's
	 * router rather than with a service mount point.
	 *
	 * @param emailTo recipient, also embedded in the link (URI-encoded)
	 * @param hash the reset hash stored on the account
	 * @param name optional greeting name
	 * @param linkBase scheme + host the link points at; defaults to `APP_DOMAIN`
	 * @param linkPath front-end route prefix that renders the new-password form; defaults to `/x/reset`
	 */
	// eslint-disable-next-line max-params -- public signature, an options object would break consumers
	async sendEmailReset(
		emailTo: string,
		hash: string,
		name: string = '',
		linkBase: string = this.linkBase,
		linkPath: string = '/x/reset'
	) {
		const link = confirmationLink(linkBase, linkPath, emailTo, hash)
		return await this.sendTemplate(emailTo, reset.resetMessage(this.platformName, link, name))
	}

	/**
	 * fallback footer
	 */
	htmlFooter() {
		return FALLBACK_FOOTER
	}

	/**
	 * send OTP
	 * @param emailTo
	 * @param otp
	 */
	async sendOTP(emailTo: string, otp: string): Promise<boolean> {
		const content = account.otpMessage(this.platformName, otp)
		return await orFalse(() => this.sendTemplate(emailTo, content))
	}

	async sendEmailPostReported(userInfo: IUserInfo, idPost: number | string) {
		const { name, surname } = userInfo.personalData
		const content = notice.postReportedMessage(idPost, name, surname, userInfo._id)
		return await this.sendTemplate(`${process.env['DEV_TEAM_EMAIL']}`, content)
	}

	getHtmlHeader(title: string) {
		return standaloneHeader(title)
	}

	getHtmlFooter() {
		return FALLBACK_FOOTER
	}

	private async sendTemplate(emailTo: string, content: IEmailContent): Promise<boolean> {
		const { subject, textBody, htmlBody } = content
		const basicMessage = new BasicMessage()
		basicMessage.setFromAddress(this.emailFrom, this.platformName)
		basicMessage.setSubject(subject)
		basicMessage.setTextBody(textBody)
		// The subject is plain text for the subject line and the text part, so only its copy placed in the HTML is escaped.
		basicMessage.setHtmlBody(
			this.emailHtmlHeader1 + escapeHtml(subject) + this.emailHtmlHeader2 + htmlBody + this.emailHtmlFooter
		)
		basicMessage.setTo(emailTo)

		return this.client.send(basicMessage).then(
			() => {
				//Handle successful API call
				return true
			},
			(e: Error) => {
				Sentry.captureException(e, {
					extra: { detail: 'Error in sending the email' }
				})
				return false
			}
		)
	}
}
