from celery import shared_task, current_task
from celery import states
from simulationAPI.helpers import ngspice_helper
from simulationAPI.helpers import hdl_helper
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


@shared_task
def process_hdl_task(task_id, simulator, stop_time=None):
    """Compile & simulate an HDL source (Icarus Verilog / GHDL),
    returning parsed VCD waveform data."""
    try:
        try:
            file_obj = list(spiceFile.objects.filter(task_id=task_id))[0]
            file_path = file_obj.file.path
            file_id = file_obj.file_id

            print("Processing HDL", file_path, file_id, simulator)

            current_task.update_state(
                state='PROGRESS',
                meta={'current_process': 'Compiling HDL Source'})

            output = hdl_helper.ExecHDL(
                file_path, file_id, simulator, stop_time)
            current_task.update_state(
                state='PROGRESS',
                meta={'current_process': 'Simulation Done, Loading Output'})
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
