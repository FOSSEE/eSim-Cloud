#!/usr/bin/env python3
"""
Live flow tests: SystemVerilog (iverilog -g2012) compiler path.

Usage: python3 test_systemverilog_flow.py [base_url]
Requires the docker compose stack to be up.
"""

from hdl_live_client import run_task, check, finish

C = 'systemverilog'

SV_COUNTER = {'filename': 'counter.sv', 'content': '''
module counter (input logic clk, input logic rst,
                output logic [3:0] count);
    always_ff @(posedge clk)
        if (rst) count <= '0;
        else     count <= count + 4'd1;
endmodule
'''}

SV_TB_COUNTER = {'filename': 'tb_counter.sv', 'content': '''
`timescale 1ns/1ps
module tb_counter;
    logic clk = 0, rst = 1;
    logic [3:0] count;
    counter uut (.clk(clk), .rst(rst), .count(count));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_counter);
        #12 rst = 0;
        #100;
        $display("SVCOUNT=%0d", count);
        $finish;
    end
endmodule
'''}

SV_FSM = {'filename': 'fsm.sv', 'content': '''
module fsm (input logic clk, input logic rst, input logic go,
            output logic done);
    typedef enum logic [1:0] {IDLE, RUN, DONE} state_t;
    state_t state;
    always_ff @(posedge clk) begin
        if (rst) state <= IDLE;
        else unique case (state)
            IDLE: state <= go ? RUN : IDLE;
            RUN:  state <= DONE;
            DONE: state <= DONE;
        endcase
    end
    assign done = (state == DONE);
endmodule
'''}

SV_TB_FSM = {'filename': 'tb_fsm.sv', 'content': '''
`timescale 1ns/1ps
module tb_fsm;
    logic clk = 0, rst = 1, go = 0;
    logic done;
    fsm uut (.clk(clk), .rst(rst), .go(go), .done(done));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_fsm);
        #12 rst = 0;
        #10 go = 1;
        #40;
        $display("FSM done=%b", done);
        $finish;
    end
endmodule
'''}

SV_BROKEN = {'filename': 'broken.sv', 'content': '''
module broken (input logic a, output logic y)   // missing semicolon
    assign y = a;
endmodule
'''}

SV_TB_STUB = {'filename': 'tb_stub.sv', 'content': '''
module tb_stub;
    initial begin #1; $finish; end
endmodule
'''}


def test_counter_sim():
    d = run_task([SV_COUNTER], SV_TB_COUNTER, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert 'SVCOUNT=10' in d.get('sim_output', ''), d.get('sim_output')


def test_enum_fsm():
    d = run_task([SV_FSM], SV_TB_FSM, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert 'FSM done=1' in d.get('sim_output', ''), d.get('sim_output')


def test_waveform_produced():
    d = run_task([SV_COUNTER], SV_TB_COUNTER, compiler=C)
    wf = d.get('waveform') or {}
    assert wf.get('graph') == 'true', 'no waveform: %r' % wf
    assert d.get('vcd_raw', '').startswith('$'), 'vcd_raw missing'


def test_syntax_check_ok():
    d = run_task([SV_COUNTER], SV_TB_COUNTER, mode='syntax_check',
                 compiler=C)
    assert d.get('success'), d.get('compile_log')


def test_syntax_check_rejects():
    d = run_task([SV_BROKEN], SV_TB_STUB, mode='syntax_check', compiler=C)
    assert not d.get('success'), 'broken SV passed syntax check'


def test_sv_keywords_need_g2012():
    # always_ff/logic are SystemVerilog-only: the plain iverilog
    # (Verilog-2005) compiler must reject what -g2012 accepts.
    d2012 = run_task([SV_COUNTER], SV_TB_COUNTER, mode='syntax_check',
                     compiler='systemverilog')
    d2005 = run_task([SV_COUNTER], SV_TB_COUNTER, mode='syntax_check',
                     compiler='iverilog')
    assert d2012.get('success'), 'g2012 rejected valid SV: %s' % \
        d2012.get('compile_log')
    assert not d2005.get('success'), \
        'plain iverilog accepted SV-only keywords'


if __name__ == '__main__':
    print('Suite: SystemVerilog (-g2012) flow\n')
    check('always_ff counter reaches 10', test_counter_sim)
    check('typedef enum FSM reaches DONE', test_enum_fsm)
    check('waveform + raw VCD returned', test_waveform_produced)
    check('syntax_check passes valid SV', test_syntax_check_ok)
    check('syntax_check rejects broken SV', test_syntax_check_rejects)
    check('SV keywords rejected by verilog-2005', test_sv_keywords_need_g2012)
    finish('systemverilog')
