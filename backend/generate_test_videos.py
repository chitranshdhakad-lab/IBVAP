import os
import cv2
import numpy as np
from pathlib import Path

VIDEOS_DIR = Path(__file__).resolve().parent / "storage" / "videos"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

def generate_border_video(filename, width=960, height=540, num_frames=270, fps=30.0, scenario="patrol"):
    filepath = str(VIDEOS_DIR / filename)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(filepath, fourcc, fps, (width, height))

    print(f"Generating {filename} ({width}x{height}, {num_frames} frames)...")

    # Colors
    sky_top = (75, 45, 25)
    sky_bottom = (120, 95, 60)
    ground_color = (35, 50, 40)
    sand_color = (45, 65, 75)
    fence_color = (90, 110, 120)

    for i in range(num_frames):
        # 1. Base terrain background
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        horizon = int(height * 0.45)

        # Gradient sky
        for y in range(horizon):
            ratio = y / max(1, horizon)
            c = [int(sky_top[j] * (1 - ratio) + sky_bottom[j] * ratio) for j in range(3)]
            frame[y, :] = c

        # Mountain silhouette
        pts = np.array([
            [0, horizon],
            [120, horizon - 50],
            [280, horizon - 20],
            [450, horizon - 75],
            [680, horizon - 35],
            [820, horizon - 60],
            [width, horizon]
        ], np.int32)
        cv2.fillPoly(frame, [pts], (45, 40, 35))

        # Ground
        for y in range(horizon, height):
            ratio = (y - horizon) / (height - horizon)
            c = [int(ground_color[j] * (1 - ratio) + sand_color[j] * ratio) for j in range(3)]
            frame[y, :] = c

        # Road / Checkpoint lane
        road_pts = np.array([
            [int(width * 0.35), height],
            [int(width * 0.65), height],
            [int(width * 0.54), horizon],
            [int(width * 0.46), horizon]
        ], np.int32)
        cv2.fillPoly(frame, [road_pts], (50, 50, 50))
        cv2.polylines(frame, [road_pts], False, (70, 70, 70), 2)

        # Dashed yellow lane center line
        for ly in range(horizon + 10, height, 30):
            progress = (ly - horizon) / (height - horizon)
            cx = int(width * 0.5 + progress * 0)
            lw = max(2, int(6 * progress))
            cv2.line(frame, (cx, ly), (cx, ly + int(15 * progress)), (30, 200, 230), lw)

        # Border perimeter fence
        fence_y = horizon + 45
        for fx in range(0, width, 25):
            cv2.line(frame, (fx, fence_y - 35), (fx, fence_y + 15), fence_color, 2)
        cv2.line(frame, (0, fence_y - 25), (width, fence_y - 25), (110, 130, 140), 2)
        cv2.line(frame, (0, fence_y), (width, fence_y), (110, 130, 140), 2)

        # Watchtower in background
        tw_x = int(width * 0.15)
        tw_y = horizon - 20
        cv2.rectangle(frame, (tw_x - 15, tw_y - 60), (tw_x + 15, tw_y), (40, 45, 50), -1)
        cv2.line(frame, (tw_x - 15, tw_y), (tw_x - 25, horizon + 30), (30, 35, 40), 3)
        cv2.line(frame, (tw_x + 15, tw_y), (tw_x + 25, horizon + 30), (30, 35, 40), 3)

        # 2. Moving Objects based on scenario
        t = i / num_frames

        if scenario == "patrol" or scenario == "Border_Test_03":
            # Patrol officer walking left to right along fence
            px = int(width * 0.2 + t * width * 0.55)
            py = fence_y + 25
            head_r = 10
            # Head
            cv2.circle(frame, (px, py - 35), head_r, (160, 190, 210), -1)
            # Body (Tactical Camo olive)
            cv2.rectangle(frame, (px - 9, py - 25), (px + 9, py), (35, 80, 50), -1)
            # Legs
            leg_step = int(np.sin(i * 0.4) * 6)
            cv2.line(frame, (px - 5, py), (px - 5 + leg_step, py + 22), (25, 40, 30), 4)
            cv2.line(frame, (px + 5, py), (px + 5 - leg_step, py + 22), (25, 40, 30), 4)

            # Inbound Vehicle moving on the road
            vx = int(width * 0.5 - 20 + np.sin(i * 0.05) * 5)
            vy = int(horizon + 20 + t * (height - horizon - 90))
            scale = 0.5 + 0.9 * t
            bw = int(120 * scale)
            bh = int(60 * scale)

            # Car body (Bolero / SUV dark green)
            cv2.rectangle(frame, (vx - bw // 2, vy), (vx + bw // 2, vy + bh), (25, 60, 40), -1)
            cv2.rectangle(frame, (vx - int(bw * 0.4), vy - int(bh * 0.5)), (vx + int(bw * 0.4), vy), (20, 50, 35), -1)
            # Windshield
            cv2.rectangle(frame, (vx - int(bw * 0.35), vy - int(bh * 0.45)), (vx + int(bw * 0.35), vy - 2), (180, 170, 140), -1)
            # Headlights
            cv2.circle(frame, (vx - int(bw * 0.38), vy + int(bh * 0.6)), int(6 * scale), (200, 255, 255), -1)
            cv2.circle(frame, (vx + int(bw * 0.38), vy + int(bh * 0.6)), int(6 * scale), (200, 255, 255), -1)

            # License Plate (HSRP) - clearly legible for ANPR!
            pw = int(52 * scale)
            ph = int(16 * scale)
            py_plate = vy + int(bh * 0.7)
            px_plate = vx - pw // 2

            # White plate background
            cv2.rectangle(frame, (px_plate, py_plate), (px_plate + pw, py_plate + ph), (250, 250, 250), -1)
            cv2.rectangle(frame, (px_plate, py_plate), (px_plate + pw, py_plate + ph), (10, 10, 10), 1)
            # Blue IND strip on left
            ind_w = max(4, int(pw * 0.18))
            cv2.rectangle(frame, (px_plate, py_plate), (px_plate + ind_w, py_plate + ph), (180, 80, 0), -1)

            # Text if scale is large enough
            if scale > 0.8:
                font_scale = 0.32 * scale
                cv2.putText(frame, "JK02C9876", (px_plate + ind_w + 2, py_plate + int(ph * 0.75)),
                            cv2.FONT_HERSHEY_SIMPLEX, font_scale, (10, 10, 10), 1, cv2.LINE_AA)

        elif scenario == "checkpoint":
            # Vehicle driving through Delta Checkpoint
            vx = int(width * 0.5)
            vy = int(horizon + 30 + t * (height - horizon - 110))
            scale = 0.6 + 0.8 * t
            bw = int(140 * scale)
            bh = int(70 * scale)

            cv2.rectangle(frame, (vx - bw // 2, vy), (vx + bw // 2, vy + bh), (30, 30, 80), -1)
            cv2.rectangle(frame, (vx - int(bw * 0.4), vy - int(bh * 0.5)), (vx + int(bw * 0.4), vy), (25, 25, 65), -1)

            # Plate
            pw = int(60 * scale)
            ph = int(18 * scale)
            py_plate = vy + int(bh * 0.75)
            px_plate = vx - pw // 2
            cv2.rectangle(frame, (px_plate, py_plate), (px_plate + pw, py_plate + ph), (250, 250, 250), -1)
            cv2.rectangle(frame, (px_plate, py_plate), (px_plate + pw, py_plate + ph), (0, 0, 0), 1)
            ind_w = max(5, int(pw * 0.16))
            cv2.rectangle(frame, (px_plate, py_plate), (px_plate + ind_w, py_plate + ph), (180, 80, 0), -1)
            if scale > 0.8:
                cv2.putText(frame, "DL08CK2024", (px_plate + ind_w + 3, py_plate + int(ph * 0.72)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35 * scale, (0, 0, 0), 1, cv2.LINE_AA)

        # Tactical HUD overlay
        cv2.putText(frame, f"CAM-01 // TACTICAL PATROL // FRM {i:04d}", (15, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 220, 255), 1, cv2.LINE_AA)
        timestamp_str = f"2026-09-20 04:20:{i//30:02d}.{(i%30)*33:03d} IST"
        cv2.putText(frame, timestamp_str, (15, 48),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 180, 180), 1, cv2.LINE_AA)

        out.write(frame)

    out.release()
    print(f"Generated {filename} ({os.path.getsize(filepath)} bytes)")

if __name__ == "__main__":
    generate_border_video("Border_Test_03.mp4", scenario="Border_Test_03")
    generate_border_video("video_01_normal_patrol.mp4", scenario="patrol")
    generate_border_video("video_02_perimeter_breach.mp4", scenario="patrol")
    generate_border_video("video_03_vehicle_anpr_checkpoint.mp4", scenario="checkpoint")
    print("All surveillance test videos successfully generated!")
