"""
Celery tasks for Verilog simulation.
Follows the same pattern as simulationAPI/tasks.py.
"""

from celery import shared_task, current_task
from celery import states
from celery.exceptions import Ignore, SoftTimeLimitExceeded
from simulationAPI.helpers import iverilog_helper
import traceback
import logging

logger = logging.getLogger(__name__)


@shared_task
def verilog_simulate_task(task_id, sources, testbench, mode='simulate', compiler='iverilog'):
    """
    Celery task to compile and simulate Verilog code.

    Args:
        task_id: UUID string
        sources: list of {"filename": "...", "content": "..."}
        testbench: {"filename": "...", "content": "..."}
        mode: 'simulate' or 'syntax_check'
    """
    try:
        current_task.update_state(
            state='PROGRESS',
            meta={'current_process': 'Compiling Verilog sources...'}
        )

        result = iverilog_helper.exec_verilog(
            sources=sources,
            testbench=testbench,
            task_id=task_id,
            mode=mode,
            compiler=compiler
        )

        current_task.update_state(
            state='PROGRESS',
            meta={'current_process': 'Processing results...'}
        )

        return result

    except SoftTimeLimitExceeded:
        return {
            'compile_log': '[ERROR] Time limit exceeded.',
            'sim_output': '',
            'waveform': {"data": [], "graph": "false"},
            'success': False
        }
    except Exception as e:
        current_task.update_state(
            state=states.FAILURE,
            meta={
                'exc_type': type(e).__name__,
                'exc_message': traceback.format_exc().split('\n')
            }
        )
        logger.exception('Verilog task failed:')
        raise Ignore()
