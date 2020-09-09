'use strict';
// 添加以下方法
// RTCPeerConnection.addTransceiver()
// RTCPeerConnection.getTranscievers();
// RTCRtpTrasceiver.stop()
// RTCRtpTrasceiver.direction
// RTCRtpTrasceiver.currentDirection
// RTCRtpTrasceiver.mid
// RTCRtpTrasceiver.receiver
// RTCRtpTrasceiver.sender
// RTCRtpSender.replaceTrack
// RTCRtpReceiver.track
import EventTarget from 'event-target-shim';
import { NativeModules, NativeEventEmitter } from 'react-native';

import MediaStream from './MediaStream';
import MediaStreamEvent from './MediaStreamEvent';
import MediaStreamTrack from './MediaStreamTrack';
import MediaStreamTrackEvent from './MediaStreamTrackEvent';
import RTCDataChannel from './RTCDataChannel';
import RTCDataChannelEvent from './RTCDataChannelEvent';
import RTCSessionDescription from './RTCSessionDescription';
import RTCIceCandidate from './RTCIceCandidate';
import RTCIceCandidateEvent from './RTCIceCandidateEvent';
import RTCEvent from './RTCEvent';
//--添加代码
import RTCRtpTransceiver from './RTCRtpTransceiver';
import RtpSender from './RtpSender';
//end
import * as RTCUtil from './RTCUtil';
import EventEmitter from './EventEmitter';

const {WebRTCModule} = NativeModules;

type RTCSignalingState =
  'stable' |
  'have-local-offer' |
  'have-remote-offer' |
  'have-local-pranswer' |
  'have-remote-pranswer' |
  'closed';

type RTCIceGatheringState =
  'new' |
  'gathering' |
  'complete';

type RTCPeerConnectionState =
  'new' |
  'connecting' |
  'connected' |
  'disconnected' |
  'failed' |
  'closed';

type RTCIceConnectionState =
  'new' |
  'checking' |
  'connected' |
  'completed' |
  'failed' |
  'disconnected' |
  'closed';

const PEER_CONNECTION_EVENTS = [
  'connectionstatechange',
  'icecandidate',
  'icecandidateerror',
  'iceconnectionstatechange',
  'icegatheringstatechange',
  'negotiationneeded',
  'signalingstatechange',
  // Peer-to-peer Data API:
  'datachannel',
  // old:
  'addstream',
  'removestream',
  'track'
];

let nextPeerConnectionId = 0;

export default class RTCPeerConnection extends EventTarget(PEER_CONNECTION_EVENTS) {
  localDescription: RTCSessionDescription;
  remoteDescription: RTCSessionDescription;

  signalingState: RTCSignalingState = 'stable';
  iceGatheringState: RTCIceGatheringState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';

  onconnectionstatechange: ?Function;
  onicecandidate: ?Function;
  onicecandidateerror: ?Function;
  oniceconnectionstatechange: ?Function;
  onicegatheringstatechange: ?Function;
  onnegotiationneeded: ?Function;
  onsignalingstatechange: ?Function;
  //添加媒体轨道回掉事件
  onaddtrack: ?Function;
  onremovetrack: ?Function;

  onaddstream: ?Function;
  onremovestream: ?Function;

  _peerConnectionId: number;
  _localStreams: Array<MediaStream> = [];
  _rtpSenders: Array<RtpSender> = [];
  _remoteStreams: Array<MediaStream> = [];
  _subscriptions: Array<any>;
  //--添加代码
  _transceivers: Array<RTCRtpTransceiver> = [];
  //end
  /**
   * The RTCDataChannel.id allocator of this RTCPeerConnection.
   */
  _dataChannelIds: Set = new Set();

  constructor(configuration) {
    super();
    this._peerConnectionId = nextPeerConnectionId++;
    WebRTCModule.peerConnectionInit(configuration, this._peerConnectionId);
    this._registerEvents();
  }

  addStream(stream: MediaStream) {
      return new Promise((resolve, reject) => {
        const index = this._localStreams.indexOf(stream);
        if (index !== -1) {
            return;
        }
        WebRTCModule.peerConnectionAddStream(stream._reactTag, this._peerConnectionId,(successful, data) => {
          if (successful) {
            resolve();
          } else {
            reject(data);
          }
        });
        this._localStreams.push(stream);
      });
  }

  removeStream(stream: MediaStream) {
      const index = this._localStreams.indexOf(stream);
      if (index === -1) {
          return;
      }
      this._localStreams.splice(index, 1);
      WebRTCModule.peerConnectionRemoveStream(stream._reactTag, this._peerConnectionId);
  }

  addTrack(track: MediaStreamTrack) {
      return new Promise((resolve, reject) => {
        var sender = this._rtpSenders.find((sender)=> sender.track().id === track.id);
        if(sender !== undefined){
          return;
        }
        WebRTCModule.peerConnectionAddTrack(track.id, this._peerConnectionId,(successful, data) => {
          if (successful) {
            var info = {
              id: data.track.id,
              kind: data.track.kind,
              label: data.track.kind,
              enabled: data.track.enabled,
              readyState: data.track.readyState,
              remote: data.track.remote
            };
            var sender = new RtpSender(data.id, new MediaStreamTrack(info));
            this._rtpSenders.push(sender);
            resolve(sender);
          } else {
            reject(data);
          }
        });
      });
  }

  removeTrack(sender: RtpSender) {
      return new Promise((resolve, reject) => {
        const index = this._rtpSenders.indexOf(sender);
        if (index === -1) {
            return;
        }
        WebRTCModule.peerConnectionRemoveTrack(sender.id(), this._peerConnectionId,(successful) => {
          if(successful){
            this._rtpSenders.splice(index, 1);
          }
          resolve(successful);
        });
      })
  }

  getRtpSenders(){
    return new Promise((resolve, reject) => {
      WebRTCModule.peerConnectionGetRtpSenders(this._peerConnectionId,(successful, data) => {
        if(successful){
          this._rtpSenders.length = 0;

          for (var i = 0; i < data.length; i++) {
            var senderOrigin = data[i];
            var info = {
              id: senderOrigin.track.id,
              kind: senderOrigin.track.kind,
              label: senderOrigin.track.kind,
              enabled: senderOrigin.track.enabled,
              readyState: senderOrigin.track.readyState,
              remote: senderOrigin.track.remote
            };
            var sender = new RtpSender(senderOrigin.id, new MediaStreamTrack(info));
            this._rtpSenders.push(sender);
          }
          resolve(this._rtpSenders);
        }else {
          reject(successful)
        }
      });
    })
  }

  //--添加代码
  addTransceiver(source: 'audio' | 'video' | MediaStreamTrack, init) {
      return new Promise((resolve, reject) => {

        let src;
        if (source === 'audio') {
          src = { type: 'audio' };
        } else if (source === 'video') {
          src = { type: 'video' };
        } else {
          src = { trackId: source.id };
        }

        WebRTCModule.peerConnectionAddTransceiver(this._peerConnectionId, {...src, init: { ...init } }, (successful, data) => {
          if (successful) {
            //--添加代码
            this._mergeState(data.state);
            //end
            resolve(this._transceivers.find((v) => v.id === data.id));
          } else {
            reject(data);
          }
        });
      });
  }
  //end
  createOffer(options) {
    return new Promise((resolve, reject) => {
      WebRTCModule.peerConnectionCreateOffer(
        this._peerConnectionId,
        RTCUtil.normalizeOfferAnswerOptions(options),
        (successful, data) => {
          if (successful) {
            //--添加代码
            this._mergeState(data.state);
            //end
            //--替换代码 data -> data.session
            resolve(new RTCSessionDescription(data.session));
          } else {
            reject(data); // TODO: convert to NavigatorUserMediaError
          }
        });
    });
  }

  createAnswer(options = {}) {
    return new Promise((resolve, reject) => {
      WebRTCModule.peerConnectionCreateAnswer(
        this._peerConnectionId,
        RTCUtil.normalizeOfferAnswerOptions(options),
        (successful, data) => {
          if (successful) {
            //--添加代码
            this._mergeState(data.state);
            //end
            //--替换代码 data -> data.session
            resolve(new RTCSessionDescription(data.session));
          } else {
            reject(data);
          }
        });
    });
  }

  setConfiguration(configuration) {
    WebRTCModule.peerConnectionSetConfiguration(configuration, this._peerConnectionId);
  }

  setLocalDescription(sessionDescription: RTCSessionDescription) {
    return new Promise((resolve, reject) => {
      WebRTCModule.peerConnectionSetLocalDescription(
        sessionDescription.toJSON ? sessionDescription.toJSON() : sessionDescription,
        this._peerConnectionId,
        (successful, data) => {
          if (successful) {
            this.localDescription = sessionDescription;
            //--添加代码
            this._mergeState(data.state);
            //end
            resolve();
          } else {
            reject(data);
          }
      });
    });
  }

  setRemoteDescription(sessionDescription: RTCSessionDescription) {
    return new Promise((resolve, reject) => {
      WebRTCModule.peerConnectionSetRemoteDescription(
        sessionDescription.toJSON ? sessionDescription.toJSON() : sessionDescription,
        this._peerConnectionId,
        (successful, data) => {
          if (successful) {
            this.remoteDescription = sessionDescription;
            //--添加代码
            this._mergeState(data.state);
            //end
            resolve();
          } else {
            reject(data);
          }
      });
    });
  }

  addIceCandidate(candidate) {
    return new Promise((resolve, reject) => {
      WebRTCModule.peerConnectionAddICECandidate(
        candidate.toJSON ? candidate.toJSON() : candidate,
        this._peerConnectionId,
        (successful) => {
          if (successful) {
            resolve()
          } else {
            // XXX: This should be OperationError
            reject(new Error('Failed to add ICE candidate'));
          }
      });
    });
  }

  getStats(track) {
    // NOTE: This returns a Promise but the format of the results is still
    // the "legacy" one. The native side (in Oobj-C) doesn't yet support the
    // new format: https://bugs.chromium.org/p/webrtc/issues/detail?id=6872
    return new Promise((resolve, reject) => {
      WebRTCModule.peerConnectionGetStats(
        (track && track.id) || '',
        this._peerConnectionId,
        (success, data) => {
          if (success) {
            // On both Android and iOS it is faster to construct a single
            // JSON string representing the array of StatsReports and have it
            // pass through the React Native bridge rather than the array of
            // StatsReports. While the implementations do try to be faster in
            // general, the stress is on being faster to pass through the React
            // Native bridge which is a bottleneck that tends to be visible in
            // the UI when there is congestion involving UI-related passing.
            try {
              const stats = JSON.parse(data);
              resolve(stats);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(data));
          }
        });
    });
  }

  getLocalStreams() {
    return this._localStreams.slice();
  }

  getRemoteStreams() {
    return this._remoteStreams.slice();
  }
  //--添加代码
  getTransceivers() {
    return this._transceivers.slice();
  }
  //end
  close() {
    WebRTCModule.peerConnectionClose(this._peerConnectionId);
  }

  _getTrack(streamReactTag, trackId): MediaStreamTrack {
    const stream
      = this._remoteStreams.find(
          stream => stream._reactTag === streamReactTag);

    return stream && stream._tracks.find(track => track.id === trackId);
  }
  //--添加代码
  _getTransceiver(state): RTCRtpTransceiver {
    const existing = this._transceivers.find((t) => t.id === state.id);
    if (existing) {
      existing._updateState(state);
      return existing;
    } else {
      let res = new RTCRtpTransceiver(this._peerConnectionId, state, (s) => this._mergeState(s));
      this._transceivers.push(res);
      return res;
    }
  }
  _mergeState(state): void {
    if (!state) {
      return;
    }

    // Merge Transceivers states
    if (state.transceivers) {
      // Apply states
      for(let transceiver of state.transceivers) {
        this._getTransceiver(transceiver);
      }
      // Restore Order
      this._transceivers =
        this._transceivers.map((t, i) => this._transceivers.find((t2) => t2.id === state.transceivers[i].id));
    }
  }
  //end

  _unregisterEvents(): void {
    this._subscriptions.forEach(e => e.remove());
    this._subscriptions = [];
  }

  _registerEvents(): void {
    this._subscriptions = [
      EventEmitter.addListener('peerConnectionOnRenegotiationNeeded', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        this.dispatchEvent(new RTCEvent('negotiationneeded'));
      }),
      EventEmitter.addListener('peerConnectionIceConnectionChanged', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        this.iceConnectionState = ev.iceConnectionState;
        this.dispatchEvent(new RTCEvent('iceconnectionstatechange'));
        if (ev.iceConnectionState === 'closed') {
          // This PeerConnection is done, clean up event handlers.
          this._unregisterEvents();
        }
      }),
      EventEmitter.addListener('peerConnectionStateChanged', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        this.connectionState = ev.connectionState;
        this.dispatchEvent(new RTCEvent('connectionstatechange'));
        if (ev.connectionState === 'closed') {
          // This PeerConnection is done, clean up event handlers.
          this._unregisterEvents();
        }
      }),
      EventEmitter.addListener('peerConnectionSignalingStateChanged', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        this.signalingState = ev.signalingState;
        this.dispatchEvent(new RTCEvent('signalingstatechange'));
      }),
      //添加远程 轨道
      EventEmitter.addListener('peerConnectionAddedTrack', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        ev.id = ev.trackId; delete ev.trackId;
        const track = new MediaStreamTrack(ev);
        this.dispatchEvent(new MediaStreamTrackEvent('track', { track }));
      }),
      EventEmitter.addListener('peerConnectionAddedStream', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        const stream = new MediaStream(ev);
        this._remoteStreams.push(stream);
        this.dispatchEvent(new MediaStreamEvent('addstream', {stream}));
      }),
      EventEmitter.addListener('peerConnectionRemovedStream', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        const stream = this._remoteStreams.find(s => s._reactTag === ev.streamId);
        if (stream) {
          const index = this._remoteStreams.indexOf(stream);
          if (index !== -1) {
            this._remoteStreams.splice(index, 1);
          }
        }
        this.dispatchEvent(new MediaStreamEvent('removestream', {stream}));
      }),
      EventEmitter.addListener('mediaStreamTrackMuteChanged', ev => {
        if (ev.peerConnectionId !== this._peerConnectionId) {
          return;
        }
        const track = this._getTrack(ev.streamReactTag, ev.trackId);
        if (track) {
          track.muted = ev.muted;
          const eventName = ev.muted ? 'mute' : 'unmute';
          track.dispatchEvent(new MediaStreamTrackEvent(eventName, {track}));
        }
      }),
      EventEmitter.addListener('peerConnectionGotICECandidate', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        const candidate = new RTCIceCandidate(ev.candidate);
        const event = new RTCIceCandidateEvent('icecandidate', {candidate});
        this.dispatchEvent(event);
      }),
      EventEmitter.addListener('peerConnectionIceGatheringChanged', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        this.iceGatheringState = ev.iceGatheringState;

        if (this.iceGatheringState === 'complete') {
          this.dispatchEvent(new RTCIceCandidateEvent('icecandidate', null));
        }

        this.dispatchEvent(new RTCEvent('icegatheringstatechange'));
      }),
      EventEmitter.addListener('peerConnectionDidOpenDataChannel', ev => {
        if (ev.id !== this._peerConnectionId) {
          return;
        }
        const evDataChannel = ev.dataChannel;
        const id = evDataChannel.id;
        // XXX RTP data channels are not defined by the WebRTC standard, have
        // been deprecated in Chromium, and Google have decided (in 2015) to no
        // longer support them (in the face of multiple reported issues of
        // breakages).
        if (typeof id !== 'number' || id === -1) {
          return;
        }
        const channel
          = new RTCDataChannel(
              this._peerConnectionId,
              evDataChannel.label,
              evDataChannel);
        // XXX webrtc::PeerConnection checked that id was not in use in its own
        // SID allocator before it invoked us. Additionally, its own SID
        // allocator is the authority on ResourceInUse. Consequently, it is
        // (pretty) safe to update our RTCDataChannel.id allocator without
        // checking for ResourceInUse.
        this._dataChannelIds.add(id);
        this.dispatchEvent(new RTCDataChannelEvent('datachannel', {channel}));
      })
    ];
  }

  /**
   * Creates a new RTCDataChannel object with the given label. The
   * RTCDataChannelInit dictionary can be used to configure properties of the
   * underlying channel such as data reliability.
   *
   * @param {string} label - the value with which the label attribute of the new
   * instance is to be initialized
   * @param {RTCDataChannelInit} dataChannelDict - an optional dictionary of
   * values with which to initialize corresponding attributes of the new
   * instance such as id
   */
  createDataChannel(label: string, dataChannelDict?: ?RTCDataChannelInit) {
    let id;
    const dataChannelIds = this._dataChannelIds;
    if (dataChannelDict && 'id' in dataChannelDict) {
      id = dataChannelDict.id;
      if (typeof id !== 'number') {
        throw new TypeError('DataChannel id must be a number: ' + id);
      }
      if (dataChannelIds.has(id)) {
        throw new ResourceInUse('DataChannel id already in use: ' + id);
      }
    } else {
      // Allocate a new id.
      // TODO Remembering the last used/allocated id and then incrementing it to
      // generate the next id to use will surely be faster. However, I want to
      // reuse ids (in the future) as the RTCDataChannel.id space is limited to
      // unsigned short by the standard:
      // https://www.w3.org/TR/webrtc/#dom-datachannel-id. Additionally, 65535
      // is reserved due to SCTP INIT and INIT-ACK chunks only allowing a
      // maximum of 65535 streams to be negotiated (as defined by the WebRTC
      // Data Channel Establishment Protocol).
      for (id = 1; id < 65535 && dataChannelIds.has(id); ++id);
      // TODO Throw an error if no unused id is available.
      dataChannelDict = Object.assign({id}, dataChannelDict);
    }
    WebRTCModule.createDataChannel(
        this._peerConnectionId,
        label,
        dataChannelDict);
    dataChannelIds.add(id);
    return new RTCDataChannel(this._peerConnectionId, label, dataChannelDict);
  }
}