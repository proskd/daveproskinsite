import { useState } from 'react'
import './ProfilePhoto.css'

type ProfilePhotoProps = {
  size?: 'large' | 'medium'
  className?: string
}

const PROFILE_IMAGE = '/profile.png'

function ProfilePhoto({ size = 'large', className = '' }: ProfilePhotoProps) {
  const [hasError, setHasError] = useState(false)

  return (
    <div className={`profile-photo profile-photo--${size} ${className}`.trim()}>
      {!hasError ? (
        <img
          className="profile-photo__image"
          src={PROFILE_IMAGE}
          alt="Dave Proskin"
          onError={() => setHasError(true)}
        />
      ) : (
        <span className="profile-photo__initials" aria-label="Profile photo placeholder">
          DP
        </span>
      )}
    </div>
  )
}

export default ProfilePhoto
