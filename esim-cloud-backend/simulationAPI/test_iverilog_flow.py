#!/usr/bin/env python3
"""
Live flow tests: Icarus Verilog (Verilog-2005) compiler path.

Usage: python3 test_iverilog_flow.py [base_url]   (default http://localhost/api)
Requires the docker compose stack to be up.
"""

from hdl_live_client import run_task, check, finish

C = 'iverilog'

AND_GATE = {'filename': 'and_gate.v', 'content': '''
module and_gate (input wire a, input wire b, output wire y);
    assign y = a & b;
endmodule
'''}

TB_AND = {'filename': 'tb_and_gate.v', 'content': '''
`timescale 1ns/1ps
module tb_and_gate;
    reg a, b; wire y;
    and_gate uut (.a(a), .b(b), .y(y));
    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_and_gate);
        a = 0; b = 0; #10;
        a = 0; b = 1; #10;
        a = 1; b = 0; #10;
        a = 1; b = 1; #10;
        $display("RESULT y=%b", y);
        $finish;
    end
endmodule
'''}

TB_NO_DUMP = {'filename': 'tb_nodump.v', 'content': '''
module tb_nodump;
    reg a, b; wire y;
    and_gate uut (.a(a), .b(b), .y(y));
    initial begin
        a = 1; b = 1; #10;
        $display("NODUMP y=%b", y);
        $finish;
    end
endmodule
'''}

BROKEN = {'filename': 'broken.v', 'content': '''
module broken (input wire a output wire y);   // missing comma
    assign y = a
endmodule
'''}

TB_STUB = {'filename': 'tb_stub.v', 'content': '''
module tb_stub;
    initial begin #1; $finish; end
endmodule
'''}

COUNTER = {'filename': 'counter.v', 'content': '''
module counter (input wire clk, input wire rst, output reg [3:0] count);
    always @(posedge clk) begin
        if (rst) count <= 4'd0;
        else     count <= count + 4'd1;
    end
endmodule
'''}

TB_COUNTER = {'filename': 'tb_counter.v', 'content': '''
`timescale 1ns/1ps
module tb_counter;
    reg clk = 0, rst = 1;
    wire [3:0] count;
    counter uut (.clk(clk), .rst(rst), .count(count));
    always #5 clk = ~clk;
    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_counter);
        #12 rst = 0;
        #100;
        $display("COUNT=%0d", count);
        $finish;
    end
endmodule
'''}


def test_and_gate_output():
    d = run_task([AND_GATE], TB_AND, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert 'RESULT y=1' in d.get('sim_output', ''), d.get('sim_output')


def test_waveform_and_vcd():
    d = run_task([AND_GATE], TB_AND, compiler=C)
    wf = d.get('waveform') or {}
    assert wf.get('graph') == 'true', 'no waveform: %r' % wf
    assert wf.get('data'), 'waveform.data empty'
    assert d.get('vcd_raw', '').startswith('$'), 'vcd_raw missing'


def test_sequential_counter():
    # clk period 10ns, rst drops at 12ns, runs to 112ns -> 10 posedges
    d = run_task([COUNTER], TB_COUNTER, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert 'COUNT=10' in d.get('sim_output', ''), d.get('sim_output')


def test_syntax_check_ok():
    d = run_task([AND_GATE], TB_AND, mode='syntax_check', compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert '[OK]' in d.get('compile_log', '')


def test_syntax_check_rejects():
    d = run_task([BROKEN], TB_STUB, mode='syntax_check', compiler=C)
    assert not d.get('success'), 'broken code passed syntax check'
    assert 'error' in d.get('compile_log', '').lower()


def test_simulate_reports_error():
    d = run_task([BROKEN], TB_STUB, compiler=C)
    assert not d.get('success'), 'broken code simulated'


def test_dumpvars_autoinjected():
    d = run_task([AND_GATE], TB_NO_DUMP, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert 'NODUMP y=1' in d.get('sim_output', '')
    assert (d.get('waveform') or {}).get('graph') == 'true', \
        'no waveform despite auto-injection'


def test_multifile_hierarchy():
    top = {'filename': 'top.v', 'content': '''
module top (input wire a, input wire b, output wire y);
    and_gate g (.a(a), .b(b), .y(y));
endmodule
'''}
    tb = {'filename': 'tb_top.v', 'content': '''
module tb_top;
    reg a, b; wire y;
    top uut (.a(a), .b(b), .y(y));
    initial begin
        $dumpfile("dump.vcd"); $dumpvars(0, tb_top);
        a = 1; b = 1; #10;
        $display("MULTI y=%b", y);
        $finish;
    end
endmodule
'''}
    d = run_task([AND_GATE, top], tb, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert 'MULTI y=1' in d.get('sim_output', '')


def test_unknown_module_fails():
    tb = {'filename': 'tb_missing.v', 'content': '''
module tb_missing;
    wire y;
    ghost_module g (.y(y));   // never defined anywhere
    initial begin #1; $finish; end
endmodule
'''}
    d = run_task([], tb, compiler=C)
    assert not d.get('success'), 'undefined module instantiation passed'


if __name__ == '__main__':
    print('Suite: Icarus Verilog flow\n')
    check('AND gate simulated, output correct', test_and_gate_output)
    check('waveform datasets + raw VCD returned', test_waveform_and_vcd)
    check('sequential counter reaches 10', test_sequential_counter)
    check('syntax_check passes valid code', test_syntax_check_ok)
    check('syntax_check rejects broken code', test_syntax_check_rejects)
    check('simulate reports compile error', test_simulate_reports_error)
    check('$dumpvars auto-injected when missing', test_dumpvars_autoinjected)
    check('multi-file hierarchy simulates', test_multifile_hierarchy)
    check('undefined module fails cleanly', test_unknown_module_fails)
    finish('iverilog')
