import { _decorator, Component, SpriteFrame, Sprite, CCFloat, Animation, AnimationClip } from 'cc';
const { ccclass, property, menu } = _decorator;

/** 程序化帧动画组件（使用 AnimationClip / Animation） */
@ccclass('FrameAnimation')
@menu(`GCore/Animation/FrameAnimation`)
export class FrameAnimation extends Component {

    @property([SpriteFrame]) spriteFrames: SpriteFrame[] = [];
    @property({ type: CCFloat, displayName: "播放速度(帧/秒)", min: 0.1, tooltip: "每秒播放的帧数" })
    playSpeed: number = 10;
    @property({ displayName: "循环播放", tooltip: "动画是否循环播放" })
    loop: boolean = true;

    // 私有变量
    private _animation: Animation | null = null;
    private _clip: AnimationClip | null = null;
    private _clipName: string = '__frame_animation_clip__';
    private _currentFrameIndex: number = 0;
    private _sprite: Sprite | null = null;

    onLoad() {
        this._sprite = this.getComponent(Sprite);
        this._initAnimation();
    }

    onDestroy() {
        if (this._animation && this._clip) {
            try {
                this._animation.removeClip(this._clip);
            } catch (e) { }
        }
    }

    /** 初始化 Animation 组件 */
    private _initAnimation() {
        this._animation = this.getComponent(Animation) || this.addComponent(Animation);

        // 创建 AnimationClip
        if (this.spriteFrames.length > 0) {
            this._createAnimationClip();
        }
    }

    /** 程序化创建 AnimationClip */
    private _createAnimationClip() {
        if (this.spriteFrames.length === 0) return;

        // 移除旧的 clip
        if (this._clip && this._animation) {
            try {
                this._animation.removeClip(this._clip);
            } catch (e) { }
        }

        // 使用引擎内置的序列帧创建接口生成动画剪辑
        const sample = Math.max(Math.floor(this.playSpeed), 1);
        this._clip = AnimationClip.createWithSpriteFrames(this.spriteFrames, sample);
        this._clip.name = this._clipName;
        this._clip.wrapMode = this.loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;

        // 添加 clip 到 Animation 组件
        if (this._animation) {
            this._animation.addClip(this._clip, this._clipName);
        }
    }

    /** 播放动画（从头开始） */
    public play() {
        if (!this._animation || !this._clip) {
            console.warn('[FrameAnimation] Animation 或 AnimationClip 未正确初始化');
            return;
        }

        this._currentFrameIndex = 0;
        this._animation.play(this._clipName);
    }

    /** 暂停动画 */
    public pause() {
        if (this._animation) {
            this._animation.pause();
        }
    }

    /** 继续播放 */
    public resume() {
        if (this._animation) {
            this._animation.resume();
        }
    }

    /** 停止动画，回到第一帧 */
    public stop() {
        if (this._animation) {
            this._animation.stop();
        }
        this._currentFrameIndex = 0;
        this._updateSpriteFrame(0);
    }

    /** 获取当前帧索引 */
    public getCurrentFrameIndex(): number {
        return this._currentFrameIndex;
    }

    /** 获取当前帧 */
    public getCurrentFrame(): SpriteFrame | null {
        if (this._currentFrameIndex < this.spriteFrames.length) {
            return this.spriteFrames[this._currentFrameIndex];
        }
        return null;
    }

    /** 是否正在播放 */
    public isPlaying(): boolean {
        if (!this._animation || !this._clip) return false;
        const state = this._animation.getState(this._clipName);
        return state ? state.isPlaying : false;
    }

    /** 跳转到指定帧 */
    public setFrameIndex(index: number) {
        if (index < 0 || index >= this.spriteFrames.length) {
            console.warn(`[FrameAnimation] 帧索引 ${index} 超出范围`);
            return;
        }

        if (this._animation && this._clip) {
            const state = this._animation.getState(this._clipName);
            if (state) {
                state.time = index / Math.max(this.playSpeed, 0.0001);
            }
        }

        this._currentFrameIndex = index;
        this._updateSpriteFrame(index);
    }

    /** 更新 Sprite 显示的帧 */
    private _updateSpriteFrame(index: number) {
        if (index >= 0 && index < this.spriteFrames.length) {
            this._sprite = this._sprite || this.getComponent(Sprite);
            if (this._sprite) {
                this._sprite.spriteFrame = this.spriteFrames[index];
            }
        }
    }

}