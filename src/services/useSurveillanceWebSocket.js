import { useState, useEffect, useRef, useCallback } from 'react';
import { getStoredSettings } from './settingsManager.js';
import { getWsUrl } from './apiConfig.js';

export function useSurveillanceWebSocket(cameraId = 'CAM-01') {
  const [isConnected, setIsConnected] = useState(false);
  const [analysisActive, setAnalysisActive] = useState(false);
  const [jobStatus, setJobStatus] = useState('IDLE');
  const [frameIndex, setFrameIndex] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0.0);
  const [videoFilename, setVideoFilename] = useState('');

  // Honest initial state: zero/idle until analysis or live data arrives
  const [liveIntelligence, setLiveIntelligence] = useState({
    persons: 0,
    vehicles: 0,
    animals: 0,
    active_tracks: 0
  });

  const [threatAssessment, setThreatAssessment] = useState({
    score: 0,
    level: 'SECURE',
    description: 'Sector monitoring initialized. Standby.',
    key_factors: ['Perimeter scanning armed']
  });

  const [activeEntities, setActiveEntities] = useState([]);
  const [latestEvent, setLatestEvent] = useState(null);
  const [videoTimestamp, setVideoTimestamp] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    let reconnectTimeout = null;
    let isMounted = true;

    // Reset live counters immediately when switching camera station
    setLiveIntelligence({ persons: 0, vehicles: 0, animals: 0, active_tracks: 0 });
    setActiveEntities([]);
    setLatestEvent(null);
    setThreatAssessment({
      score: 0,
      level: 'SECURE',
      description: 'Sector monitoring initialized. Standby.',
      key_factors: ['Perimeter scanning armed']
    });
    setAnalysisActive(false);

    const connect = () => {
      const wsUrl = getWsUrl(cameraId);
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isMounted) setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (!isMounted) return;

            if (data.analysis_active !== undefined) {
              setAnalysisActive(Boolean(data.analysis_active));
            }
            if (data.job_status !== undefined) {
              setJobStatus(data.job_status);
            }
            if (data.frame_index !== undefined) {
              setFrameIndex(data.frame_index);
            }
            if (data.total_frames !== undefined) {
              setTotalFrames(data.total_frames);
            }
            if (data.progress_percent !== undefined) {
              setProgressPercent(data.progress_percent);
            }
            if (data.video_filename !== undefined) {
              setVideoFilename(data.video_filename);
            }
            if (data.live_intelligence) {
              setLiveIntelligence(data.live_intelligence);
            }
            if (data.threat_assessment) {
              setThreatAssessment(data.threat_assessment);
            }
            if (data.active_entities !== undefined) {
              setActiveEntities(data.active_entities);
            }
            if (data.video_timestamp !== undefined) {
              setVideoTimestamp(data.video_timestamp);
            }
            if (data.latest_event) {
              setLatestEvent(data.latest_event);
            }
          } catch (err) {
            console.warn('Error parsing WS frame:', err);
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            setIsConnected(false);
            setAnalysisActive(false);
            const s = getStoredSettings();
            if (s.autoReconnect !== false) {
              reconnectTimeout = setTimeout(connect, 2500);
            }
          }
        };

        ws.onerror = () => {
          if (isMounted) setIsConnected(false);
        };
      } catch (e) {
        if (isMounted) {
          setIsConnected(false);
          const s = getStoredSettings();
          if (s.autoReconnect !== false) {
            reconnectTimeout = setTimeout(connect, 2500);
          }
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, [cameraId]);

  const sendCommand = useCallback((cmd) => {
    if (cmd?.action === 'stop_analysis') {
      setAnalysisActive(false);
      setJobStatus('STOPPED');
      setActiveEntities([]);
    } else if (cmd?.action === 'start_analysis') {
      setAnalysisActive(true);
      setJobStatus('RUNNING');
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(cmd));
    }
  }, []);

  return {
    isConnected,
    analysisActive,
    jobStatus,
    frameIndex,
    totalFrames,
    progressPercent,
    videoFilename,
    liveIntelligence,
    threatAssessment,
    activeEntities,
    latestEvent,
    videoTimestamp,
    sendCommand
  };
}
