import json, sys
from pymavlink.dialects.v20 import ardupilotmega as m
mav = m.MAVLink(None, srcSystem=255, srcComponent=190)
mav.seq = 0
cases = []
def add(name, msg, fields):
    buf = msg.pack(mav); mav.seq = 0
    cases.append({"name": name, "fields": fields, "hex": buf.hex()})
add("PARAM_SET", m.MAVLink_param_set_message(1,1,b"MOT_SPIN_ARM",0.1,9), {"target_system":1,"target_component":1,"param_id":"MOT_SPIN_ARM","param_value":0.1,"param_type":9})
add("COMMAND_LONG", m.MAVLink_command_long_message(1,1,209,0,4,0,8,2,4,0,0), {"target_system":1,"target_component":1,"command":209,"confirmation":0,"param1":4,"param2":0,"param3":8,"param4":2,"param5":4,"param6":0,"param7":0})
add("PARAM_REQUEST_LIST", m.MAVLink_param_request_list_message(1,1), {"target_system":1,"target_component":1})
add("HEARTBEAT", m.MAVLink_heartbeat_message(6,8,0,0,0,3), {"type":6,"autopilot":8,"base_mode":0,"custom_mode":0,"system_status":0,"mavlink_version":3})
add("ESC_TELEMETRY_1_TO_4", m.MAVLink_esc_telemetry_1_to_4_message([27,24,25,24],[1600,1600,1600,1600],[60,0,0,0],[1,2,3,4],[4180,0,0,0],[10,10,10,10]), {"temperature":[27,24,25,24],"voltage":[1600,1600,1600,1600],"current":[60,0,0,0],"totalcurrent":[1,2,3,4],"rpm":[4180,0,0,0],"count":[10,10,10,10]})
add("PARAM_VALUE", m.MAVLink_param_value_message(b"SERVO_BLH_RVMASK",4.0,9,1200,512), {"param_id":"SERVO_BLH_RVMASK","param_value":4,"param_type":9,"param_count":1200,"param_index":512})
add("STATUSTEXT", m.MAVLink_statustext_message(3,b"Motor Test: vehicle not landed",0,0), {"severity":3,"text":"Motor Test: vehicle not landed","id":0,"chunk_seq":0})
# Status bar: sensors present (gyro, accel, mag, baro, GPS), CPU load, battery, GPS fix, log list.
add("SYS_STATUS", m.MAVLink_sys_status_message(0x2F,0x2F,0x2F,120,12000,-1,-1,0,0,0,0,0,0), {"onboard_control_sensors_present":0x2F,"onboard_control_sensors_enabled":0x2F,"onboard_control_sensors_health":0x2F,"load":120,"voltage_battery":12000,"current_battery":-1,"battery_remaining":-1})
add("GPS_RAW_INT", m.MAVLink_gps_raw_int_message(123456789,3,-338688000,1512093000,12000,120,200,0,0,11), {"time_usec":123456789,"fix_type":3,"lat":-338688000,"lon":1512093000,"alt":12000,"eph":120,"epv":200,"vel":0,"cog":0,"satellites_visible":11})
add("LOG_REQUEST_LIST", m.MAVLink_log_request_list_message(1,1,0,0xFFFF), {"target_system":1,"target_component":1,"start":0,"end":65535})
add("LOG_ENTRY", m.MAVLink_log_entry_message(3,4,4,1795700000,2097152), {"id":3,"num_logs":4,"last_log_num":4,"time_utc":1795700000,"size":2097152})
# Ports / Compass / Accel & Level: MAVFTP, compass calibration, live attitude and sensors.
ftp = [0]*251; ftp[0]=7; ftp[3]=4; ftp[4]=14; ftp[12:26]=list(b"@SYS/uarts.txt")
add("FILE_TRANSFER_PROTOCOL", m.MAVLink_file_transfer_protocol_message(0,1,1,ftp), {"target_network":0,"target_system":1,"target_component":1,"payload":ftp})
add("MAG_CAL_PROGRESS", m.MAVLink_mag_cal_progress_message(1,3,2,1,42,[255,255,15,0,0,0,0,0,0,0],0,0,0), {"compass_id":1,"cal_mask":3,"cal_status":2,"attempt":1,"completion_pct":42,"completion_mask":[255,255,15,0,0,0,0,0,0,0],"direction_x":0,"direction_y":0,"direction_z":0})
add("MAG_CAL_REPORT", m.MAVLink_mag_cal_report_message(0,3,4,1,4.5,-35.25,12.5,88.0,1.01,0.99,1.0,0.01,-0.02,0.0,6.5,0,2,1.02), {"compass_id":0,"cal_mask":3,"cal_status":4,"autosaved":1,"fitness":4.5,"ofs_x":-35.25,"ofs_y":12.5,"ofs_z":88.0,"diag_x":1.01,"diag_y":0.99,"diag_z":1.0,"offdiag_x":0.01,"offdiag_y":-0.02,"offdiag_z":0.0,"orientation_confidence":6.5,"old_orientation":0,"new_orientation":2,"scale_factor":1.02})
add("ATTITUDE", m.MAVLink_attitude_message(123456,0.0070,-0.0052,1.5184,0.01,-0.02,0.03), {"time_boot_ms":123456,"roll":0.0070,"pitch":-0.0052,"yaw":1.5184,"rollspeed":0.01,"pitchspeed":-0.02,"yawspeed":0.03})
add("VFR_HUD", m.MAVLink_vfr_hud_message(0,0,87,0,1.5,-0.25), {"airspeed":0,"groundspeed":0,"heading":87,"throttle":0,"alt":1.5,"climb":-0.25})
add("RAW_IMU", m.MAVLink_raw_imu_message(123456789,10,-20,-1000,1,2,3,11,-210,455,0,4100), {"time_usec":123456789,"xacc":10,"yacc":-20,"zacc":-1000,"xgyro":1,"ygyro":2,"zgyro":3,"xmag":11,"ymag":-210,"zmag":455,"id":0,"temperature":4100})
add("SCALED_IMU2", m.MAVLink_scaled_imu2_message(123456,10,-20,-1000,1,2,3,11,-202,437,4100), {"time_boot_ms":123456,"xacc":10,"yacc":-20,"zacc":-1000,"xgyro":1,"ygyro":2,"zgyro":3,"xmag":11,"ymag":-202,"zmag":437,"temperature":4100})
add("SCALED_IMU3", m.MAVLink_scaled_imu3_message(123456,10,-20,-1000,1,2,3,-5,-190,420,4100), {"time_boot_ms":123456,"xacc":10,"yacc":-20,"zacc":-1000,"xgyro":1,"ygyro":2,"zgyro":3,"xmag":-5,"ymag":-190,"zmag":420,"temperature":4100})
add("COMMAND_LONG", m.MAVLink_command_long_message(0,0,42429,0,16777215,0,0,0,0,0,0), {"target_system":0,"target_component":0,"command":42429,"confirmation":0,"param1":16777215,"param2":0,"param3":0,"param4":0,"param5":0,"param6":0,"param7":0})
json.dump(cases, open(sys.argv[1],"w"))
