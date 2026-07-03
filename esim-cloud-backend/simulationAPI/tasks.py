from celery import shared_task, current_task
from celery import states
from simulationAPI.helpers import ngspice_helper
from celery.exceptions import Ignore
import traceback
from simulationAPI.models import spiceFile
from celery.exceptions import SoftTimeLimitExceeded

"""
Tasks cleanup after 3 secs and the process is stopped after 5 seconds.
"""


# @shared_task(soft_time_limit=3, time_limit=5)
@shared_task
def process_task(task_id):
    try:
        try:

            file_obj = list(spiceFile.objects.filter(task_id=task_id))[0]
            file_path = file_obj.file.path
            file_id = file_obj.file_id

            print("Processing ", file_path, file_id)

            current_task.update_state(
                state='PROGRESS',
                meta={'current_process': 'Started Processing File'})

            output = ngspice_helper.ExecNetlist(file_path, file_id)
            current_task.update_state(
                state='PROGRESS',
                meta={'current_process': 'Processed Netlist, Loading Output'})
            return output

        except Exception as e:
            current_task.update_state(state=states.FAILURE, meta={
                'exc_type': type(e).__name__,
                'exc_message': traceback.format_exc().split('\n')})
            print('Exception Occured: ', type(e).__name__)
            raise Ignore()
    except SoftTimeLimitExceeded:
        output = {'fail': "time limit exceeded"}
        return output
# =========================================================================
# Parametric Sweep (Phase 1)
# =========================================================================
import re
import os
import uuid as _uuid
from django.conf import settings
from django.db.models import F
from simulationAPI.models import SweepRun, SweepStep


def make_variant(base, comp, value):
    """
    Substitute a component's value in a netlist (format-tolerant:
    lowercase, multi-space). Keeps the app's existing .control block
    (print all > data.txt) so ExecNetlist's parser works unchanged.

    e.g. "r1  in out 1k" + (comp="r1", value=5500) -> "r1  in out 5500"
    """
    return re.sub(
        r'(?im)^(' + re.escape(comp) + r'\s+\S+\s+\S+\s+)(\S+)(.*)$',
        r'\g<1>{:g}\g<3>'.format(value),
        base
    )


@shared_task
def run_sweep_step(sweep_run_id, step_id):
    """
    Execute a single sweep step: substitute the component value into the
    base netlist, run it through ExecNetlist with an ISOLATED file_id
    (so parallel steps never collide in ExecNetlist's per-file_id temp
    dir), store the result, and bump the parent's completed counter.
    """
    step = SweepStep.objects.get(id=step_id)
    run = SweepRun.objects.get(id=sweep_run_id)

    step.status = 'RUNNING'
    step.save(update_fields=['status', 'updated_at'])

    # mark parent RUNNING on first step
    if run.status == 'PENDING':
        SweepRun.objects.filter(id=sweep_run_id, status='PENDING').update(
            status='RUNNING')

    try:
        # 1. build this step's variant netlist
        variant = make_variant(run.base_netlist, run.component, step.value)

        # 2. write it to an isolated file, keyed on a UNIQUE file_id
        file_id = _uuid.uuid4()
        tmp_path = os.path.join(
            settings.MEDIA_ROOT, 'sweep_{}.cir'.format(file_id))
        with open(tmp_path, 'w') as f:
            f.write(variant)

        # 3. run through the EXISTING helper (reuses ngspice + parse.py).
        #    ExecNetlist deletes tmp_path and its temp dir in finally.
        output = ngspice_helper.ExecNetlist(tmp_path, file_id)

        step.result = output
        if isinstance(output, dict) and output.get('fail'):
            step.status = 'FAILED'
            step.error = str(output.get('fail'))[:2000]
        else:
            step.status = 'DONE'
        step.save(update_fields=['result', 'status', 'error', 'updated_at'])

    except Exception as e:
        step.status = 'FAILED'
        step.error = '{}: {}'.format(type(e).__name__, str(e))[:2000]
        step.save(update_fields=['status', 'error', 'updated_at'])

    # 4. atomically bump parent progress; mark DONE when all steps finish
    SweepRun.objects.filter(id=sweep_run_id).update(
        completed_steps=F('completed_steps') + 1)
    run.refresh_from_db()
    if run.completed_steps >= run.total_steps:
        SweepRun.objects.filter(id=sweep_run_id).update(status='DONE')

    return {'step_index': step.step_index, 'status': step.status}
