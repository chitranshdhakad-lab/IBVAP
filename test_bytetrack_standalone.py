from ultralytics import YOLO
import cv2

model = YOLO('backend/models/yolov8n.pt')
cap = cv2.VideoCapture('backend/storage/videos/Border_Test_03.mp4')

track_history = {}
frame_count = 0

print("Running Ultralytics ByteTrack on Border_Test_03.mp4...")
while True:
    ret, frame = cap.read()
    if not ret:
        break
    frame_count += 1
    res = model.track(frame, persist=True, tracker='bytetrack.yaml', conf=0.25, imgsz=640, verbose=False)[0]
    if res.boxes is not None and len(res.boxes) > 0:
        for b in res.boxes:
            cid = int(b.cls[0].item())
            cname = model.names[cid]
            if cname != 'person':
                continue
            tid = int(b.id[0].item()) if b.id is not None else None
            conf = float(b.conf[0].item())
            box = [round(float(c), 1) for c in b.xyxy[0].tolist()]
            if tid:
                if tid not in track_history:
                    track_history[tid] = {'first': frame_count, 'last': frame_count, 'count': 0, 'confs': []}
                track_history[tid]['last'] = frame_count
                track_history[tid]['count'] += 1
                track_history[tid]['confs'].append(conf)

            if frame_count in [25, 50, 75, 100, 125, 150, 175, 200, 225, 250]:
                print(f"Frame {frame_count:3d}: ByteTrack ID: {tid} | {cname} | conf: {conf:.2f} | bbox: {box}")

cap.release()
print("\n=== BYTE TRACK SUMMARY ===")
for tid, info in track_history.items():
    avg_conf = sum(info['confs']) / len(info['confs'])
    print(f"Track ID {tid}: frames {info['first']} -> {info['last']} ({info['count']} detections, avg conf {avg_conf:.2f})")
