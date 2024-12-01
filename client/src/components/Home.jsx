import React from 'react';
import './Home.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFutbol } from '@fortawesome/free-solid-svg-icons'; // นำเข้าไอคอนฟุตบอล

const Home = () => {
  return (
    <div className='header'>
      <h1>
        <FontAwesomeIcon icon={faFutbol} style={{ marginRight: '10px', color: '#32cd32' }} />
        ยินดีต้อนรับสู่ระบบจองสนามฟุตบอล CPE Arena
      </h1>
      <a href="/booking">⚽ จองสนาม</a><br />
      <a href="/ticket">🎟️ ตั๋ว</a>
      <p>กรุณาเลือกการดำเนินการจากเมนูด้านบน</p>
    </div>
  );
};

export default Home;
