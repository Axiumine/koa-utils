import { StringLib } from '@lib/StringLib.mjs'
import * as Sentry from '@sentry/node'
import { BasicMessage, SocketLabsClient } from '@socketlabs/email'
import { throwInternalError } from '@throw/throwInternalError.mjs'
import * as dotenv from 'dotenv'

dotenv.config()

interface ISendEmail {
	emailFrom: string
	emailFromName: string
	emailTo: string
	subject: string
	textBody: string
	htmlBody: string
}

interface IUserInfo {
	_id: string
	personalData: {
		name: string
		surname: string
	}
}

export class SocketLabsLib {
	private StringObj: StringLib
	private readonly platformName: string
	private readonly linkBase: string
	private readonly emailFrom: string
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private client: any
	private readonly emailHtmlHeader1: string
	private readonly emailHtmlHeader2: string
	private readonly emailHtmlFooter: string

	constructor(htmlHeader1: string = '', htmlHeader2: string = '', htmlFooter: string = '') {
		this.client = new SocketLabsClient(
			/* c8 ignore next -- env fallback '0' covered only when SOCKETLABS_SERVER_ID is unset */
			parseInt(process.env.SOCKETLABS_SERVER_ID || '0'),
			`${process.env.SOCKETLABS_SERVER_APIKEY}`,
			{ requestTimeout: 120, numberOfRetries: 3 }
		)
		this.StringObj = new StringLib()
		this.platformName = `${process.env.PLATFORM_NAME}`
		this.linkBase = `${process.env.APP_DOMAIN}`
		this.emailFrom = `${process.env.EMAIL_FROM}`

		this.emailHtmlHeader1 = htmlHeader1 === '' ? this.htmlHeader1() : htmlHeader1
		this.emailHtmlHeader2 = htmlHeader2 === '' ? this.htmlHeader2() : htmlHeader2
		this.emailHtmlFooter = htmlFooter === '' ? this.htmlFooter() : htmlFooter
	}

	async sendEmailVerify(emailTo: string, hash: string, name: string = '') {
		const subject = `Confirm your email for ${this.platformName}`
		const encodedEmail = encodeURI(emailTo)
		const nameFixed = this.fixName(name)
		const link = `${this.linkBase}/check/verify-email/${encodedEmail}/${hash}`
		const linkHtml = this.StringObj.makeLink(link)

		const messageTxt = `Hi${nameFixed}, you or someone else is registering you on ${this.platformName}.
      You can confirm the registration by copying this link ${link} into your browser. The Team`
		const messageHtml = `Hi${nameFixed},<br>you or someone else is registering you on ${this.platformName}.<br><br>
      You can confirm the registration by visiting this link ${linkHtml}<br><br>
      <br><br>The Team`

		return await this.sendTemplate(emailTo, subject, messageTxt, messageHtml)
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
		const encodedEmail = encodeURI(emailTo)
		const subject = `Confirm your email for ${this.platformName}`
		const nameFixed = this.fixName(name)
		const link = `${this.linkBase}/check/verify-change-email/${encodedEmail}/${hash}`
		const linkHtml = this.StringObj.makeLink(link)

		const messageTxt = `Hi${nameFixed}, you or someone else has changed the email you sign in with.
      You can confirm by copying this link ${link} into your browser. The Team.`

		const messageHtml = `Hi${nameFixed},<br>you or someone else has changed the email you sign in with.<br><br>
      You can confirm the registration by visiting this link ${linkHtml}
      <br><br>The Team.`

		return await this.sendTemplate(emailTo, subject, messageTxt, messageHtml)
	}

	async sendWelcome(emailTo: string) {
		const subject = `Welcome to ${this.platformName}`
		const linkHtml = this.StringObj.makeLink(this.linkBase, this.platformName)
		const messageTxt = `Welcome to ${this.platformName}`
		const messageHtml = `Welcome to ${linkHtml}`

		return await this.sendTemplate(emailTo, subject, messageTxt, messageHtml)
	}

	/**
	 * Send account disabled notification
	 * @param emailTo
	 */
	async accountDisabled(emailTo: string) {
		const subject = 'Your account has been disabled'
		const textBody = 'Hi, we are sorry but your account has been disabled. Contact us for more information.'
		const htmlBody = `<p>${textBody}</p>`

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	/**
	 * Send account disabled notification
	 * @param emailTo
	 */
	async accountBanned(emailTo: string) {
		const subject = 'Your account has been banned'
		const textBody = 'Hi, we are sorry but your account has been banned. Contact us for more information.'
		const htmlBody = `<p>${textBody}</p>`

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	/**
	 * alertDevTeam
	 * @param err
	 */
	async alertDevTeam(err: string) {
		const textBody = 'error 500 ' + err
		const htmlBody = '<p>error 500 <br><br>' + err + '</p>'

		return await this.sendTemplate(`${process.env.DEV_TEAM_EMAIL}`, `${this.platformName} error 500`, textBody, htmlBody)
	}

	/**
	 *
	 * @param emailTo
	 * @param times
	 */
	async wrongHash(emailTo: string, times: number) {
		if (times > 5) throwInternalError()
		const remainingTimes = 5 - times

		const subject = 'Wrong activation link'
		const textBody = `Hi, you or someone else is trying to verify your email with a wrong link. You have ${remainingTimes} attempts remaining.`
		const htmlBody = `<p>${textBody}</p>`

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	/*****************
	 * Too much verify requests
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async tooMuchVerifyRequests(emailTo: string) {
		const subject = 'Too many attempts to verify your email'
		const textBody = 'Hi, you have made more than 5 attempts to verify your email. You need to repeat the registration request.'
		const htmlBody =
			'<p>Hi, you have made 5 or more attempts to verify your email. You need to repeat the registration request.</p>'

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	/*****************
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async hashReqTooOld(emailTo: string) {
		const subject = 'Activation link expired'
		const textBody =
			'Hi, the activation link you are trying to use is older than 3 days and has expired. You need to repeat the registration request.'
		const htmlBody =
			'<p>Hi, the activation link you are trying to use is older than 3 days and has expired. You need to repeat the registration request.</p>'

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	/*****************
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async emailAlreadyValid(emailTo: string) {
		const subject = 'Account already valid'
		const textBody = 'Hi, your account is already valid, you can log in.'
		const htmlBody = `<p>${textBody}</p>`

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	/**
	 * Send subscription email
	 * @param emailTo
	 * @param otp
	 */
	async sendSubscriptionEmail(emailTo: string, otp: string) {
		const subject = `Activate your ${this.platformName} account`
		const url = `${this.linkBase}/x/emailVerify`
		const urlHtml = this.StringObj.makeLink(url)
		const linkHomeHtml = this.StringObj.makeLink(this.linkBase, this.platformName)

		const textBody = `To confirm your subscription on ${this.platformName}, open the following link in your browser
     ${url} and enter the following activation code: ${otp}`

		const htmlBody = `<p>To confirm your subscription on ${linkHomeHtml}, open the following link in your browser
    ${urlHtml} and enter the following activation code: ${otp}</p>`

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	async sendResetPwdConfirmation(emailTo: string, name: string = '') {
		const subject = `Password reset for ${this.platformName}`
		const link = this.linkBase
		const linkHtml = this.StringObj.makeLink(link, this.platformName)
		const nameFixed = this.fixName(name)

		const textBody = `Hi${nameFixed}, you have confirmed your new password. You can now log in at: ${link}. The Team.`
		const htmlBody = `Hi${nameFixed},<br>you have confirmed your new password.<br><br>You can now log in at:<br>${linkHtml}<br><br>The Team.`

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	async sendResetPwdConfirmationHash(email: string, name: string, hash: string): Promise<boolean> {
		const encodedEmail = encodeURI(email)
		const subject = `Password change confirmation for ${this.platformName}`
		const linkReset = this.linkBase + '/index.php?q=reset&hash=' + hash + '&email=' + encodedEmail

		const textBody = 'Hi ' + name + ', you have confirmed your new password. You can now log in at: ' + this.linkBase + ' . '
		const htmlBody =
			this.getHtmlHeader(subject) +
			'Hi ' +
			name +
			',<br>you have confirmed your new password.<br><br>You can now log in at:<br> ' +
			this.StringObj.makeLink(linkReset) +
			'<br><br>The Team' +
			this.getHtmlFooter()

		try {
			return await this.sendTemplate(email, subject, textBody, htmlBody)
		} catch (e) {
			Sentry.captureException(e)
			return false
		}
	}

	async sendEmailReset(emailTo: string, hash: string, name: string = '') {
		const subject = `Password reset for ${this.platformName}`
		const encodedEmail = encodeURI(emailTo)
		const link = `${this.linkBase}/x/reset/${encodedEmail}/${hash}`
		const linkHtml = this.StringObj.makeLink(link)
		const nameFixed = this.fixName(name)

		const textBody = `Hi${nameFixed}, you or someone else has requested a password reset. You can change your login password
      by copying this link ${link} into your browser. The Team.`
		const htmlBody = `Hi${nameFixed},<br>you or someone else has requested a password reset.<br><br>
      You can change your password by clicking the link:<br>${linkHtml}
      <br><br>The Team.`

		return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
	}

	/**
	 * fallback footer
	 */
	htmlFooter() {
		return '</p></td>' + '  </tr>' + ' </table>' + '</body>'
	}

	/**
	 * send OTP
	 * @param emailTo
	 * @param otp
	 */
	async sendOTP(emailTo: string, otp: string): Promise<boolean> {
		const subject = `OTP code for ${this.platformName}`
		const textBody = `To confirm your subscription on ${this.platformName}, enter the following OTP code: ${otp}`
		const htmlBody = `<p>To confirm your subscription on ${this.platformName}, enter the following OTP code: ${otp}</p>`

		try {
			return await this.sendTemplate(emailTo, subject, textBody, htmlBody)
		} catch (e) {
			Sentry.captureException(e)
			return false
		}
	}

	async sendEmailPostReported(userInfo: IUserInfo, idPost: number | string) {
		const subject = 'Post ' + idPost + ' reported'

		const messageTxt =
			'Hi, post ' +
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
			'Hi, post ' +
			idPost +
			' has been reported by ' +
			userInfo.personalData.name +
			' ' +
			userInfo.personalData.surname +
			' (id: ' +
			userInfo._id +
			').' +
			this.getHtmlFooter()

		return await this.sendTemplate(`${process.env.DEV_TEAM_EMAIL}`, subject, messageTxt, messageHtml)
	}

	getHtmlHeader(title: string) {
		return (
			'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
			'<html xmlns="http://www.w3.org/1999/xhtml">' +
			' <head>' +
			'  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
			'  <title>' +
			title +
			'</title>' +
			'  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>' +
			'</head>' +
			'</html>' +
			'<body style="margin: 0; padding: 0;">' +
			' <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">' +
			'  <tr>' +
			'   <td bgcolor="#ffffff" style="padding: 40px 30px 40px 30px;"><p style="color: #000000; font-family: Verdana, sans-serif; font-size: 12pt;">'
		)
	}

	getHtmlFooter() {
		return '</p></td>' + '  </tr>' + ' </table>' + '</body>'
	}

	private async sendTemplate(emailTo: string, subject: string, textBody: string, htmlBody: string): Promise<boolean> {
		return await this.sendEmail({
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		})
	}

	private async sendEmail(args: ISendEmail): Promise<boolean> {
		const { emailFrom, emailFromName, emailTo, subject, textBody, htmlBody } = args
		const basicMessage = new BasicMessage()
		basicMessage.setFromAddress(emailFrom, emailFromName)
		basicMessage.setSubject(subject)
		basicMessage.setTextBody(textBody)
		basicMessage.setHtmlBody(this.emailHtmlHeader1 + subject + this.emailHtmlHeader2 + htmlBody + this.emailHtmlFooter)
		basicMessage.setTo(emailTo)

		return this.client.send(basicMessage).then(
			() => {
				//Handle successful API call
				// console.debug('[sendEmail] Email sent correctly')
				//console.				// console.debug('[sendEmail] Email sent correctly')(res);
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

	/**
	 * fallback header
	 * @private
	 */
	private htmlHeader1() {
		return (
			'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
			'<html lang="en" xmlns="http://www.w3.org/1999/xhtml">' +
			' <head>' +
			'  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
			'  <title>'
		)
	}

	/**
	 * fallback header
	 * @private
	 */
	private htmlHeader2() {
		return (
			'</title>' +
			'  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>' +
			'</head>' +
			'</html>' +
			'<body style="margin: 0; padding: 0;">' +
			' <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">' +
			'  <tr>' +
			'   <td bgcolor="#ffffff" style="padding: 40px 30px 40px 30px;"><p style="color: #000000; font-family: Verdana, sans-serif; font-size: 12pt;">'
		)
	}

	private fixName(name: string) {
		return name !== '' ? ` ${name}` : ''
	}
}
