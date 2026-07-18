import logging
from celery import shared_task
from pylti.common import post_message, generate_request_xml, \
    LTIPostMessageException
from .utils import consumers, message_identifier, ArduinoConsumers
from .models import Submission, ArduinoSubmission

logger = logging.getLogger(__name__)


@shared_task
def sweep_failed_passbacks():
    """
    Periodic task that re-queues grade passback for every submission
    stuck at 'failed' status, so a temporary LMS outage does not
    require a teacher to manually notice and click resend.
    """
    failed_submissions = list(
        Submission.objects.filter(passback_status='failed'))
    for submission in failed_submissions:
        submission.passback_status = 'pending'
        submission.save()
        send_grade_passback.delay(submission.id)

    failed_arduino_submissions = list(
        ArduinoSubmission.objects.filter(passback_status='failed'))
    for submission in failed_arduino_submissions:
        submission.passback_status = 'pending'
        submission.save()
        send_arduino_grade_passback.delay(submission.id)

    logger.info(
        "Swept %d failed submissions and %d failed arduino "
        "submissions for grade passback retry",
        len(failed_submissions), len(failed_arduino_submissions))


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_grade_passback(self, submission_id):
    """
    Send score to the LMS via LTI Basic Outcomes Service, with
    automatic retries on transient failure.
    :param submission_id: primary key of Submission
    """
    try:
        submission = Submission.objects.get(id=submission_id)
    except Submission.DoesNotExist:
        logger.error("Submission %s not found", submission_id)
        return

    lti_session = submission.ltisession
    submission.passback_attempts += 1
    submission.passback_status = 'pending'
    submission.save()

    xml = generate_request_xml(
        message_identifier(), 'replaceResult',
        lti_session.lis_result_sourcedid, submission.score)

    try:
        success = post_message(
            consumers(), lti_session.oauth_consumer_key,
            lti_session.lis_outcome_service_url, xml)
        if not success:
            raise LTIPostMessageException('Post grade failed')
        submission.lms_success = True
        submission.passback_status = 'success'
        submission.save()
    except Exception as exc:
        submission.lms_success = False
        if self.request.retries >= self.max_retries:
            submission.passback_status = 'failed'
            submission.save()
            logger.error(
                "Grade passback permanently failed for submission %s",
                submission_id)
        else:
            submission.save()
            raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_arduino_grade_passback(self, submission_id):
    """
    Arduino variant of send_grade_passback.
    :param submission_id: primary key of ArduinoSubmission
    """
    try:
        submission = ArduinoSubmission.objects.get(id=submission_id)
    except ArduinoSubmission.DoesNotExist:
        logger.error("ArduinoSubmission %s not found", submission_id)
        return

    lti_session = submission.ltisession
    submission.passback_attempts += 1
    submission.passback_status = 'pending'
    submission.save()

    xml = generate_request_xml(
        message_identifier(), 'replaceResult',
        lti_session.lis_result_sourcedid, submission.score)

    try:
        success = post_message(
            ArduinoConsumers(), lti_session.oauth_consumer_key,
            lti_session.lis_outcome_service_url, xml)
        if not success:
            raise LTIPostMessageException('Post grade failed')
        submission.lms_success = True
        submission.passback_status = 'success'
        submission.save()
    except Exception as exc:
        submission.lms_success = False
        if self.request.retries >= self.max_retries:
            submission.passback_status = 'failed'
            submission.save()
            logger.error(
                "Grade passback permanently failed for submission %s",
                submission_id)
        else:
            submission.save()
            raise self.retry(exc=exc)
