#!/usr/bin/env python3
"""
Live flow tests: VHDL (NVC) compiler path.

Usage: python3 test_vhdl_flow.py [base_url]
Requires the docker compose stack to be up with NVC installed.
"""

from hdl_live_client import run_task, check, finish

C = 'vhdl'

AND_VHD = {'filename': 'and_gate.vhd', 'content': '''
library ieee;
use ieee.std_logic_1164.all;

entity and_gate is
  port (a, b : in std_logic; y : out std_logic);
end entity;

architecture rtl of and_gate is
begin
  y <= a and b;
end architecture;
'''}

TB_AND_VHD = {'filename': 'tb_and.vhd', 'content': '''
library ieee;
use ieee.std_logic_1164.all;

entity tb_and is end entity;

architecture sim of tb_and is
  signal a, b, y : std_logic := '0';
begin
  uut: entity work.and_gate port map (a => a, b => b, y => y);
  process begin
    a <= '1'; b <= '1';
    wait for 10 ns;
    report "VHDL_AND y=" & std_logic'image(y);
    wait;
  end process;
end architecture;
'''}

SINGLE_FILE = {'filename': 'design_and_tb.vhd', 'content': '''
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
  port (clk, rst : in std_logic;
        count    : out std_logic_vector(3 downto 0));
end entity;

architecture rtl of counter is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process(clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0');
      else c <= c + 1; end if;
    end if;
  end process;
  count <= std_logic_vector(c);
end architecture;

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- the LAST entity in the file is elaborated as the testbench
entity tb_counter is end entity;

architecture sim of tb_counter is
  signal clk   : std_logic := '0';
  signal rst   : std_logic := '1';
  signal count : std_logic_vector(3 downto 0);
  signal stop  : boolean := false;
begin
  uut: entity work.counter port map (clk => clk, rst => rst, count => count);

  clk_gen: process begin
    while not stop loop
      wait for 5 ns; clk <= not clk;
    end loop;
    wait;
  end process;

  stim: process begin
    wait for 12 ns; rst <= '0';
    wait for 100 ns;
    report "VHDL_COUNT=" &
      integer'image(to_integer(unsigned(count)));
    stop <= true;
    wait;
  end process;
end architecture;
'''}

BROKEN_VHD = {'filename': 'broken.vhd', 'content': '''
library ieee;
use ieee.std_logic_1164.all;

entity broken is
  port (a : in std_logic  y : out std_logic);  -- missing semicolon
end entity;

architecture rtl of broken is
begin
  y <= a
end architecture;
'''}


def test_and_gate():
    d = run_task([AND_VHD], TB_AND_VHD, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert "VHDL_AND y='1'" in d.get('sim_output', ''), d.get('sim_output')


def test_waveform_and_vcd():
    d = run_task([AND_VHD], TB_AND_VHD, compiler=C)
    wf = d.get('waveform') or {}
    assert wf.get('graph') == 'true', 'no waveform: %r' % wf
    assert wf.get('data'), 'waveform.data empty'
    assert d.get('vcd_raw', '').startswith('$'), 'vcd_raw missing'


def test_single_file_design_plus_tb():
    # clk period 10ns, rst drops at 12ns, runs 100ns -> 10 rising edges
    d = run_task([], SINGLE_FILE, compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert 'VHDL_COUNT=10' in d.get('sim_output', ''), d.get('sim_output')


def test_multifile():
    d = run_task([AND_VHD], TB_AND_VHD, compiler=C)
    assert d.get('success'), d.get('compile_log')


def test_syntax_check_ok():
    d = run_task([AND_VHD], TB_AND_VHD, mode='syntax_check', compiler=C)
    assert d.get('success'), d.get('compile_log')
    assert '[OK]' in d.get('compile_log', '')


def test_syntax_check_rejects():
    d = run_task([BROKEN_VHD], TB_AND_VHD, mode='syntax_check', compiler=C)
    assert not d.get('success'), 'broken VHDL passed syntax check'
    assert 'error' in d.get('compile_log', '').lower()


def test_simulate_reports_error():
    d = run_task([BROKEN_VHD], TB_AND_VHD, compiler=C)
    assert not d.get('success'), 'broken VHDL simulated'


if __name__ == '__main__':
    print('Suite: VHDL (NVC) flow\n')
    check('AND gate simulated, report correct', test_and_gate)
    check('waveform datasets + raw VCD returned', test_waveform_and_vcd)
    check('single-file design+tb, counter = 10', test_single_file_design_plus_tb)
    check('multi-file analyze+elaborate+run', test_multifile)
    check('syntax_check passes valid VHDL', test_syntax_check_ok)
    check('syntax_check rejects broken VHDL', test_syntax_check_rejects)
    check('simulate reports analysis error', test_simulate_reports_error)
    finish('vhdl')
