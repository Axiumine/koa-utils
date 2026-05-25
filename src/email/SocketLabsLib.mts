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

interface IInfoUtente {
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
		const subject = `Conferma l'email per ${this.platformName}`
		const encodedEmail = encodeURI(emailTo)
		const nameFixed = this.fixName(name)
		const link = `${this.linkBase}/check/verify-email/${encodedEmail}/${hash}`
		const linkHtml = this.StringObj.makeLink(link)

		const messaggioTxt = `Ciao${nameFixed}, tu o qualcuno ti sta registrando su ${this.platformName}.
      Puoi confermare la registrazione copiando questo link ${link} nel browser. Lo staff`
		const messaggioHtml = `Ciao${nameFixed},<br>tu o qualcuno ti sta registrando su ${this.platformName}.<br><br>
      Puoi confermare la registrazione visitando questo link ${linkHtml}<br><br>
      <br><br>Lo staff`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody: messaggioTxt,
			htmlBody: messaggioHtml
		}
		return await this.sendEmail(message)
	}

	/*
  async sendEmailPostSegnalato(infoUtente, idPost) {
    const subject = 'Post ' + idPost + ' segnalato'

    const messaggioTxt =
      'Ciao, il post ' +
      idPost +
      ' è stato segnalato da ' +
      infoUtente.personalData.name +
      ' ' +
      infoUtente.personalData.surname +
      ' (id: ' +
      infoUtente._id +
      ').'

    const messaggioHtml =
      this.getHtmlHeader(subject) +
      'Ciao, il post ' +
      idPost +
      ' è stato segnalato da ' +
      infoUtente.personalData.name +
      ' ' +
      infoUtente.personalData.surname +
      ' (id: ' +
      infoUtente._id +
      ').' +
      this.getHtmlFooter()

    const message = {
      emailFrom: this.emailFrom,
      emailFromName: this.platformName,
      emailTo: 'dummy@example.com',
      subject,
      textBody: messaggioTxt,
      htmlBody: messaggioHtml
    }
    return await this.sendEmail(message)
  }
*/
	/**
	 * @fixme gestire retry
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
		const subject = `Conferma l'email per ${this.platformName}`
		const nameFixed = this.fixName(name)
		const link = `${this.linkBase}/check/verify-change-email/${encodedEmail}/${hash}`
		const linkHtml = this.StringObj.makeLink(link)

		const messaggioTxt = `Ciao${nameFixed}, tu o qualcuno ha modificato l'email con cui accedi.
      Puoi confermare copiando questo link ${link} nel browser. Lo staff.`

		const messaggioHtml = `Ciao${nameFixed},<br>tu o qualcuno ha modificato l'email con cui accedi.<br><br>" +
      'Puoi confermare la registrazione visitando questo link ${linkHtml}
      <br><br>Lo staff.`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody: messaggioTxt,
			htmlBody: messaggioHtml
		}
		return await this.sendEmail(message)
	}

	async sendWelcome(emailTo: string) {
		const subject = `Benvenuto su ${this.platformName}`
		const linkHtml = this.StringObj.makeLink(this.linkBase, this.platformName)
		const messaggioTxt = `Benvenuto su ${this.platformName}`
		const messaggioHtml = `Benvenuto su ${linkHtml}`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody: messaggioTxt,
			htmlBody: messaggioHtml
		}
		return await this.sendEmail(message)
	}

	/**
	 * Send account disabled notification
	 * @param emailTo
	 */
	async accountDisabled(emailTo: string) {
		const subject = 'Il tuo account è stato disabilitato'
		const textBody = 'Ciao, ci spiace ma il tuo account è stato disabilitato. Contattaci per maggiori informazioni.'
		const htmlBody = `<p>${textBody}</p>`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}

		return await this.sendEmail(message)
	}

	/**
	 * Send account disabled notification
	 * @param emailTo
	 */
	async accountBanned(emailTo: string) {
		const subject = 'Il tuo account è stato bannato'
		const textBody = 'Ciao, ci spiace ma il tuo account è stato bannato. Contattaci per maggiori informazioni.'
		const htmlBody = `<p>${textBody}</p>`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}

		return await this.sendEmail(message)
	}

	/**
	 * alertDevTeam
	 * @param err
	 */
	async alertDevTeam(err: string) {
		const textBody = 'errore 500 ' + err
		const htmlBody = '<p>errore 500 <br><br>' + err + '</p>'

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo: `${process.env.DEV_TEAM_EMAIL}`,
			subject: `${this.platformName} errore 500`,
			textBody,
			htmlBody
		}

		return await this.sendEmail(message)
	}

	/**
	 *
	 * @param emailTo
	 * @param times
	 */
	async wrongHash(emailTo: string, times: number) {
		if (times > 5) throwInternalError()
		const remainingTimes = 5 - times

		const subject = 'Link di attivazione errato'
		const textBody = `Ciao, tu o qualcuno sta cercando di verificare la tua email con un link errato. Ti rimangono altri ${remainingTimes} tentativi.`
		const htmlBody = `<p>${textBody}</p>`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}

		return await this.sendEmail(message)
	}

	/*****************
	 * Too much verify requests
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async tooMuchVerifyRequests(emailTo: string) {
		const subject = 'Troppi tentativi di verifica della tua email'
		const textBody =
			'Ciao, hai fatto più di 5 o più tentativi di verifica della tua email. Devi ripetere la richiesta di registrazione.'
		const htmlBody =
			'<p>Ciao, hai fatto 5 o più tentativi di verifica della tua email. Devi ripetere la richiesta di registrazione.</p>'

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}

		return await this.sendEmail(message)
	}

	/*****************
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async hashReqTooOld(emailTo: string) {
		const subject = 'Link di attivazione scaduto'
		const textBody =
			'Ciao, il link di attivazione che stai tentando di usare è più vecchio di 3 giorni ed è scaduto. Devi ripetere la richiesta di registrazione.'
		const htmlBody =
			'<p>Ciao, il link di attivazione che stai tentando di usare è più vecchio di 3 giorni ed è scaduto. Devi ripetere la richiesta di registrazione.</p>'

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}

		return await this.sendEmail(message)
	}

	/*****************
	 * @param emailTo
	 * @returns {Promise<string|null>}
	 */
	async emailAlreadyValid(emailTo: string) {
		const subject = 'Account già valido'
		const textBody = 'Ciao, il tuo account è già valido, puoi eseguire il login.'
		const htmlBody = `<p>${textBody}</p>`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}
		return await this.sendEmail(message)
	}

	/**
	 * Send subscription email
	 * @param emailTo
	 * @param otp
	 */
	async sendSubscriptionEmail(emailTo: string, otp: string) {
		const subject = `Attiva il tuo account ${this.platformName}}`
		const url = `${this.linkBase}'/x/emailVerify`
		const urlHtml = this.StringObj.makeLink(url)
		const linkHomeHtml = this.StringObj.makeLink(this.linkBase, this.platformName)

		const textBody = `Per confermare la tua iscrizione su ${this.platformName}, apri nel browser il seguente link
     ${url} ed inserisci il seguente codice di attivazione: ${otp}`

		const htmlBody = `<p>Per confermare la tua iscrizione su ${linkHomeHtml}, apri nel browser il seguente link
    ${urlHtml} ed inserisci il seguente codice di attivazione: ${otp}</p>`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}
		return await this.sendEmail(message)
	}

	async sendConfermaResetPwd(emailTo: string, name: string = '') {
		const subject = `Reset della password per ${this.platformName}`
		const link = this.linkBase
		const linkHtml = this.StringObj.makeLink(link, this.platformName)
		const nameFixed = this.fixName(name)

		const textBody = `Ciao${nameFixed}, hai confermato la nuova password. Ora puoi accedere a: ${link}. Lo Staff.`
		const htmlBody = `Ciao${nameFixed},<br>hai confermato la nuova password.<br><br>Ora puoi accedere a:<br>${linkHtml}<br><br>Lo staff.`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}
		return await this.sendEmail(message)
	}

	async sendConfermaResetPwdHash(email: string, name: string, hash: string) {
		const encodedEmail = encodeURI(email)
		const subject = 'Reset della password per Polis24.it'
		const linkReset = this.linkBase + '/index.php?q=reset&hash=' + hash + '&email=' + encodedEmail

		const textBody = 'Ciao ' + name + ', hai confermato la nuova password. Ora puoi accedere a: ' + this.linkBase + ' . '
		const htmlBody =
			this.getHtmlHeader(subject) +
			'Ciao ' +
			name +
			',<br>hai confermato la nuova password.<br><br>Ora puoi accedere a:<br> ' +
			this.StringObj.makeLink(linkReset) +
			'<br><br>Lo staff' +
			this.getHtmlFooter()

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo: email,
			subject: 'Conferma cambio password per Polis24.it',
			textBody: textBody,
			htmlBody: htmlBody
		}

		let ret: boolean | null
		try {
			ret = await this.sendEmail(message)
		} catch (e) {
			Sentry.captureException(e)
			ret = null
		}
		return ret ? ret : null // se invio va a buon fine, ritorna l'hash, altrimenti null
	}

	async sendEmailReset(emailTo: string, hash: string, name: string = '') {
		const subject = `Reset della password per ${this.platformName}`
		const encodedEmail = encodeURI(emailTo)
		const link = `${this.linkBase}/x/reset/${encodedEmail}/${hash}`
		const linkHtml = this.StringObj.makeLink(link)
		const nameFixed = this.fixName(name)

		const textBody = `Ciao${nameFixed}, tu o qualcuno ha richiesto un reset della password. Puoi cambiare la password di accesso
      copiando questo link ${link} nel browser. Lo staff.`
		const htmlBody = `Ciao${nameFixed},<br>tu o qualcuno ha richiesto un reset della password.<br><br>
      Puoi cambiare la password cliccando il link:<br>${linkHtml}
      <br><br>Lo staff.`

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo,
			subject,
			textBody,
			htmlBody
		}

		return await this.sendEmail(message)
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
	async sendOTP(emailTo: string, otp: string) {
		let textBody = 'Per confermare la tua iscrizione su Polis24, inserisci il seguente codice OTP: ' + otp
		let htmlBody = '<p>Per confermare la tua iscrizione su Polis24, inserisci il seguente codice OTP: ' + otp + '</p>'

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo: emailTo,
			subject: 'Codice OTP per Polis24',
			textBody: textBody,
			htmlBody: htmlBody
		}

		let ret: string | null
		try {
			await this.sendEmail(message)
			ret = null
		} catch (e) {
			Sentry.captureException(e)
			ret = null
		}
		/* c8 ignore next -- ret is always null in this function */
		return ret ? ret : null // se invio va a buon fine, ritorna l'hash, altrimenti null
	}

	async sendEmailPostSegnalato(infoUtente: IInfoUtente, idPost: number | string) {
		const subject = 'Post ' + idPost + ' segnalato'

		const messaggioTxt =
			'Ciao, il post ' +
			idPost +
			' è stato segnalato da ' +
			infoUtente.personalData.name +
			' ' +
			infoUtente.personalData.surname +
			' (id: ' +
			infoUtente._id +
			').'

		const messaggioHtml =
			this.getHtmlHeader(subject) +
			'Ciao, il post ' +
			idPost +
			' è stato segnalato da ' +
			infoUtente.personalData.name +
			' ' +
			infoUtente.personalData.surname +
			' (id: ' +
			infoUtente._id +
			').' +
			this.getHtmlFooter()

		const message = {
			emailFrom: this.emailFrom,
			emailFromName: this.platformName,
			emailTo: 'dummy@example.com',
			subject,
			textBody: messaggioTxt,
			htmlBody: messaggioHtml
		}
		return await this.sendEmail(message)
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
			'<html lang="it" xmlns="http://www.w3.org/1999/xhtml">' +
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
